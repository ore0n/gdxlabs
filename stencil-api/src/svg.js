// Copied verbatim from ore0n/allblobs api/src/svg.js — keep the two in step.
/**
 * Turning a model's answer into SVG that is safe to put on a page.
 *
 * Two jobs, and they are separate on purpose:
 *
 *   extractSvg   pull the document out of whatever the model wrapped it in
 *   sanitiseSvg  rebuild it from an allowlist, dropping everything else
 *
 * The extraction step exists because `omnisvg` is not the only thing that can
 * answer. LiteLLM's fallback chain is `omnisvg -> claude -> gpt`, and when a
 * remote model answers it writes prose and code fences around the document
 * however it likes. The local shim returns bare SVG.
 *
 * The sanitising step exists because an SVG *is* a script host. `<script>`,
 * `<foreignObject>` with embedded HTML, `on*` handlers, `href="javascript:"`
 * and `<use href="//evil/">` all execute or fetch when the document is inlined
 * into a page. So nothing is stripped from the input — the output is *built*
 * from the subset that is known drawing, which means a construct nobody
 * thought of is dropped by default rather than passed through by default.
 *
 * The client renders the result inside an <img src="data:image/svg+xml,...">
 * as a second layer: an SVG in an <img> cannot run script even if this file
 * has a bug. Neither layer is trusted to be the only one.
 */

export class SvgError extends Error {}

/** 256 KiB. An OmniSVG illustration is a few KiB; anything near this is wrong. */
export const MAX_SVG_BYTES = 256 * 1024;

const ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc",
  "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "linearGradient", "radialGradient", "stop",
  // Clipping and blur. Added once a real generated blob was rendered before
  // and after this function: gradients survived, but every clipped detail
  // did not. Unclipped, the eyelid shadows sat as hard bars across the eyes,
  // the bounce-light spilled out past the body, and the teeth floated above
  // the mouth instead of inside it. Half the style was being thrown away
  // silently, and nothing in the record said so.
  //
  // Presentational only — none of these run script or fetch anything, and
  // `safeValue` already refuses a `url(...)` that is not a local `#id`, so a
  // filter cannot be pointed off-document. feGaussianBlur is the one
  // primitive the style needs; the rest of the filter zoo stays out until
  // something actually asks for it, which is this file's whole design.
  "clipPath", "filter", "feGaussianBlur",
]);

/** Elements whose *content* must go too, not just the tag. */
const DROP_SUBTREE = new Set(["script", "style", "foreignObject", "image", "use", "a", "animate", "set", "text"]);

const GLOBAL_ATTRS = new Set([
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
  "opacity", "transform", "clip-rule", "id",
  // The references that make clipPath and filter do anything. Without these
  // the elements above would be kept and then ignored, which is the same
  // outcome with more markup.
  "clip-path", "filter",
]);

const ATTRS = {
  svg: new Set(["viewBox", "width", "height", "xmlns", "preserveAspectRatio"]),
  path: new Set(["d", "pathLength"]),
  circle: new Set(["cx", "cy", "r"]),
  ellipse: new Set(["cx", "cy", "rx", "ry"]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
  line: new Set(["x1", "y1", "x2", "y2"]),
  polyline: new Set(["points"]),
  polygon: new Set(["points"]),
  linearGradient: new Set(["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform", "spreadMethod"]),
  radialGradient: new Set(["cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform", "spreadMethod"]),
  stop: new Set(["offset", "stop-color", "stop-opacity"]),
  clipPath: new Set(["clipPathUnits"]),
  // x/y/width/height on a filter are its region, not a drawn rectangle —
  // omitting them clips the blur to the default -10%/120% box, which crops
  // exactly the soft edge the blur exists to produce.
  filter: new Set(["x", "y", "width", "height", "filterUnits", "primitiveUnits"]),
  feGaussianBlur: new Set(["stdDeviation", "in", "edgeMode", "result"]),
};

/** Elements that never have children, so a stray open tag must not nest. */
const VOID_ISH = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "stop"]);

/**
 * What counts as "the picture is not empty".
 *
 * Groups, defs and gradients are not on this list on purpose: a document of
 * nothing but `<g>` and a gradient renders as a blank square, and the whole
 * point of the emptiness check is to catch a truncated generation before it
 * becomes a permanent entry in somebody's collection.
 */
const SHAPES = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);

/** Ancestors whose contents define something rather than draw it. */
const NON_DRAWING_PARENTS = new Set(["defs", "clipPath", "filter"]);

/**
 * Does this shape actually put ink on the page?
 *
 * The `drawn === 0` guard below exists to turn an empty generation into a
 * retry, and it was not doing its job: it counted every `<path>` regardless
 * of whether `d` described a line. Thirty-five blobs shipped whose entire
 * body was `d="M0.0 M.0 Z"` — two movetos and a close, which draws nothing —
 * and every one of them passed as "drawable", got cached and got committed.
 * They looked like blobs only because eyes.js had drawn eyes on top.
 *
 * Two ways a shape is not ink:
 *
 * - It sits inside `<defs>`, `<clipPath>` or `<filter>`, where it is a
 *   definition. That was harmless while none of those could hold shapes;
 *   allowing clipPath is exactly what makes it matter.
 * - It is a path whose `d` has no drawing command at all. `M` moves and `Z`
 *   closes; without an L/H/V/C/S/Q/T/A between them nothing is stroked or
 *   filled. Deliberately narrow — judging whether real commands describe a
 *   *visible* shape means reimplementing a renderer, and guessing wrong
 *   would reject good blobs to catch bad ones.
 */
function isDrawn(name, pathData, open) {
  if (open.some((parent) => NON_DRAWING_PARENTS.has(parent))) return false;
  if (name !== "path") return true;
  return /[LHVCSQTA]/i.test(String(pathData ?? ""));
}

/** Elements whose text content is kept (everything else's text is dropped). */
const TEXT_CONTENT = new Set(["title", "desc"]);

/**
 * Pull the SVG document out of a model answer.
 *
 * Deliberately dumb: first `<svg` to the last `</svg>`. A model that emits two
 * documents plus commentary gets the span covering both, and sanitiseSvg then
 * rejects it for having trailing content after the root — which is the right
 * outcome, because guessing which of two was meant is worse than asking for
 * another roll.
 */
export function extractSvg(text) {
  if (typeof text !== "string" || !text.trim()) throw new SvgError("empty response");
  const start = text.indexOf("<svg");
  const end = text.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end < start) {
    throw new SvgError("response contained no SVG document");
  }
  return text.slice(start, end + "</svg>".length);
}

/**
 * A tag/text scanner that respects quoting.
 *
 * Splitting on /<[^>]*>/ is the obvious approach and it is wrong here: SVG
 * path data and transform lists routinely contain `>` inside an attribute
 * value, and a scanner that ends the tag there mis-parses the rest of the
 * document into text — which then silently loses paths.
 */
function* scan(src) {
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      yield { type: "text", value: src.slice(i) };
      return;
    }
    if (lt > i) yield { type: "text", value: src.slice(i, lt) };

    if (src.startsWith("<!--", lt)) {
      const close = src.indexOf("-->", lt);
      i = close === -1 ? src.length : close + 3;
      continue;
    }
    if (src.startsWith("<!", lt) || src.startsWith("<?", lt)) {
      const close = src.indexOf(">", lt);
      i = close === -1 ? src.length : close + 1;
      continue;
    }

    let j = lt + 1;
    let quote = null;
    while (j < src.length) {
      const ch = src[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j++;
    }
    if (j >= src.length) throw new SvgError("unterminated tag");

    const raw = src.slice(lt + 1, j);
    i = j + 1;
    if (raw.startsWith("/")) {
      yield { type: "close", name: raw.slice(1).trim() };
    } else {
      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const match = /^([A-Za-z_][\w:.-]*)/.exec(body);
      if (!match) throw new SvgError("malformed tag");
      yield {
        type: "open",
        name: match[1],
        attrs: body.slice(match[1].length),
        selfClosing,
      };
    }
  }
}

const ATTR_RE = /([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function parseAttrs(src) {
  const out = [];
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(src)) !== null) {
    out.push([m[1], m[3] ?? m[4] ?? m[5] ?? ""]);
  }
  return out;
}

/**
 * Is this attribute value plain drawing data?
 *
 * Only two things are allowed to look like a reference: nothing, or a local
 * `url(#id)` paint server. Anything with a scheme, a protocol-relative prefix
 * or an entity escape is refused rather than escaped — a legitimate blob has
 * no reason to carry one, so refusing costs nothing and guessing costs a lot.
 */
function safeValue(value) {
  // 64 KiB, raised from 4096 after it was found silently deleting the body of
  // every traced blob.
  //
  // VTracer emits one `d` per colour region, and the largest region is the
  // creature itself: measured on a real drawing, 13 of 370 paths were over
  // 4096 characters and the longest was 22,229. Those are exactly the big
  // shapes. The attribute was dropped while the element was kept, so the
  // output was a `<path fill="#CE31AA"/>` that draws nothing — a blob with a
  // hole where its body should be, and nothing in the record saying so.
  //
  // OmniSVG never hit this because it draws with many short paths, which is
  // why the limit survived this long. The document as a whole is already
  // capped at MAX_SVG_BYTES, so this is a guard against one pathological
  // attribute rather than against size, and 64 KiB is far past anything a
  // drawing needs while still refusing something absurd.
  if (value.length > 65536) return false;
  if (/[<>]/.test(value)) return false;
  if (/&#|&\w+;/.test(value)) return false;
  if (/url\(\s*(?!#)/i.test(value)) return false;
  if (/[a-z][a-z0-9+.-]*:/i.test(value) && !/^\s*(none|currentColor)\s*$/i.test(value)) return false;
  return true;
}

function escapeText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attrAllowed(element, name) {
  if (/^on/i.test(name)) return false;
  if (name.includes(":")) return false; // xlink:href and friends
  if (GLOBAL_ATTRS.has(name)) return true;
  return (ATTRS[element] ?? new Set()).has(name);
}

/**
 * Rebuild an SVG from the allowlist.
 *
 * Returns `{ svg, viewBox, elements }`. Throws SvgError when the input is not
 * a single SVG document, is oversized, or survives sanitising with nothing
 * drawable left — an empty picture is a failed generation, not a blob, and it
 * should cost a retry rather than a slot in someone's collection.
 */
export function sanitiseSvg(input, { maxBytes = MAX_SVG_BYTES, size = 200 } = {}) {
  if (typeof input !== "string") throw new SvgError("svg must be a string");
  if (Buffer.byteLength(input, "utf8") > maxBytes) {
    throw new SvgError(`svg exceeds ${maxBytes} bytes`);
  }

  const out = [];
  /** @type {string[]} names currently open in the *output* */
  const open = [];
  let skipDepth = 0;
  let root = null;
  let rootClosed = false;
  let drawn = 0;
  let viewBox = null;
  let rootWidth = null;
  let rootHeight = null;

  for (const token of scan(input)) {
    // Everything after the root closes is commentary, a second document, or a
    // stray fragment. None of the three belongs in this blob.
    if (rootClosed) continue;

    if (skipDepth > 0) {
      if (token.type === "open" && !token.selfClosing && DROP_SUBTREE.has(token.name)) skipDepth++;
      else if (token.type === "close" && DROP_SUBTREE.has(token.name)) skipDepth--;
      continue;
    }

    if (token.type === "text") {
      const keep = open.length > 0 && TEXT_CONTENT.has(open[open.length - 1]);
      if (keep && token.value.trim()) out.push(escapeText(token.value.trim()));
      continue;
    }

    if (token.type === "close") {
      const idx = open.lastIndexOf(token.name);
      if (idx === -1) continue; // a close with no matching open — drop it
      while (open.length > idx) out.push(`</${open.pop()}>`);
      if (token.name === "svg") rootClosed = true;
      continue;
    }

    // open
    //
    // The root check comes before the allowlist, not after: a wrapper element
    // that is merely *not allowed* would otherwise be skipped, and its
    // children would be adopted as though the document had been rooted in svg
    // all along. The input to this function is already sliced to start at
    // `<svg`, so anything else in front of it means the extraction was wrong.
    if (root === null && token.name !== "svg") {
      throw new SvgError("document does not start with <svg>");
    }
    if (DROP_SUBTREE.has(token.name)) {
      if (!token.selfClosing) skipDepth = 1;
      continue;
    }
    if (!ELEMENTS.has(token.name)) continue;
    if (root !== null && token.name === "svg") continue; // nested svg: flatten it away

    const attrs = [];
    let pathData = null;
    for (const [name, value] of parseAttrs(token.attrs)) {
      if (!attrAllowed(token.name, name)) continue;
      if (!safeValue(value)) continue;
      if (token.name === "path" && name === "d") pathData = value;
      if (token.name === "svg") {
        if (name === "viewBox") viewBox = value.trim();
        // Kept only to reconstruct a missing viewBox — see below. The root's
        // own attributes are written from scratch.
        if (name === "width") rootWidth = value.trim();
        if (name === "height") rootHeight = value.trim();
        continue;
      }
      attrs.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    }

    if (token.name === "svg") {
      root = "svg";
      open.push("svg");
      out.push("<svg");
      continue; // attributes appended after the pass, once viewBox is known
    }

    if (SHAPES.has(token.name) && isDrawn(token.name, pathData, open)) drawn++;
    const body = attrs.length ? ` ${attrs.join(" ")}` : "";
    if (token.selfClosing || VOID_ISH.has(token.name)) {
      out.push(`<${token.name}${body}/>`);
    } else {
      out.push(`<${token.name}${body}>`);
      open.push(token.name);
    }
  }

  if (root === null) throw new SvgError("no <svg> element");
  while (open.length) out.push(`</${open.pop()}>`);
  if (drawn === 0) throw new SvgError("svg contained nothing drawable");

  // A viewBox is not optional here. Without one the blob renders at whatever
  // intrinsic size the producer happened to write, and every card on the page
  // is a different size.
  //
  // When there is no viewBox but the root carried a pixel width and height,
  // *derive* one from them rather than falling back. Not every producer writes
  // a viewBox: vtracer emits `width="256" height="256"` and nothing else, and
  // squaring that off at the default silently cropped the drawing to its
  // top-left corner — a blob that looked truncated for a reason nobody would
  // find by reading the paths.
  const pixels = (value) => {
    const parsed = Number.parseFloat(String(value ?? "").replace(/px$/i, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const [w, h] = [pixels(rootWidth), pixels(rootHeight)];

  const box = /^-?[\d.]+(\s+|,)-?[\d.]+(\s+|,)[\d.]+(\s+|,)[\d.]+$/.test(viewBox ?? "")
    ? viewBox
    : w && h
      ? `0 0 ${w} ${h}`
      : `0 0 ${size} ${size}`;

  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="100%" height="100%" role="img">`;
  const svg = head + out.slice(1).join("");
  return { svg, viewBox: box, elements: drawn };
}

/** The SVG as a data URL, which is how the page consumes it. */
export function toDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
