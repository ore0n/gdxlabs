/**
 * Airbrush stencil geometry, without a DOM.
 *
 * Everything works on a raster in plate space: a Uint8Array `cut` of w*h
 * pixels, 1 where paint goes through the plate, 0 where the plate stays. The
 * page rasterises the SVG into that grid (app.mjs); from there on it is pure
 * array work, so all of it runs — and is tested — in Node.
 *
 *   clean      drop specks and cut-outs too thin to paint through
 *   bridge     join every island of plate to the frame
 *   check      find plate too thin to print
 *   trace      plate outline + holes as polygons (mm)
 *   stl        extruded triangles -> binary STL (extrusion itself is three.js)
 *
 * Connectivity is 4-neighbour for the plate everywhere. Two plate pixels that
 * touch only at a corner are not one printed part — the slicer prints that
 * joint as nothing — so they are treated as separate and bridged.
 */

// ---------------------------------------------------------------------------
// components
// ---------------------------------------------------------------------------

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Label connected regions where mask[i] === value.
 * Returns { labels (0 = not value), sizes[label], edge: Set of labels touching the frame }.
 */
export function labelComponents(mask, w, h, value = 1, conn = 4) {
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const edge = new Set();
  const stack = new Int32Array(w * h);
  const nbrs = conn === 8 ? N8 : N4;
  for (let start = 0; start < w * h; start++) {
    if (labels[start] || mask[start] !== value) continue;
    const id = sizes.length;
    sizes.push(0);
    labels[start] = id;
    let top = 0;
    stack[top++] = start;
    while (top) {
      const i = stack[--top];
      sizes[id]++;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge.add(id);
      for (const [dx, dy] of nbrs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!labels[j] && mask[j] === value) {
          labels[j] = id;
          stack[top++] = j;
        }
      }
    }
  }
  return { labels, sizes, edge };
}

/** Remove regions of `value` smaller than minArea pixels (they become the other value). */
export function removeSmall(mask, w, h, minArea, value = 1) {
  if (minArea <= 1) return mask;
  const out = mask.slice();
  const { labels, sizes } = labelComponents(mask, w, h, value, 4);
  for (let i = 0; i < out.length; i++) {
    if (labels[i] && sizes[labels[i]] < minArea) out[i] = value ? 0 : 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// morphology, via a chamfer distance transform
// ---------------------------------------------------------------------------

/**
 * Distance (px) from each pixel where mask is 1 to the nearest 0 pixel or the
 * frame (outside the grid counts as 0). Two-pass chamfer 1 / sqrt2: within a
 * few percent of Euclidean, which is plenty for tenths of a millimetre.
 */
export function distanceToZero(mask, w, h, outsideIsZero = true) {
  const INF = 1e9;
  const D = 1;
  const DD = Math.SQRT2;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const edge = outsideIsZero ? 0 : INF;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? edge : d[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + D, at(x, y - 1) + D, at(x - 1, y - 1) + DD, at(x + 1, y - 1) + DD);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + D, at(x, y + 1) + D, at(x + 1, y + 1) + DD, at(x - 1, y + 1) + DD);
    }
  }
  return d;
}

export function erode(mask, w, h, r) {
  const d = distanceToZero(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i] > r ? 1 : 0;
  return out;
}

export function dilate(mask, w, h, r) {
  // Distance from each empty pixel to the nearest set one; outside the grid
  // is not set.
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = distanceToZero(inv, w, h, false);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || d[i] <= r ? 1 : 0;
  return out;
}

/** Morphological opening: everything thinner than 2r disappears. */
export function open(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  return dilate(erode(mask, w, h, r), w, h, r);
}

// ---------------------------------------------------------------------------
// bridges
// ---------------------------------------------------------------------------

function stampDisk(mask, w, h, cx, cy, r, value) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) mask[y * w + x] = value;
    }
  }
}

/** Paint a straight bar of plate (cut = 0) from (x0,y0) to (x1,y1). */
export function stampBar(cut, w, h, x0, y0, x1, y1, width) {
  const r = Math.max(0.5, width / 2);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / 0.5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    stampDisk(cut, w, h, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, 0);
  }
}

/**
 * Multi-source BFS from `sources` through cut pixels (8-neighbour, so paths
 * run diagonally too) until a pixel with `isTarget(i)` is reached.
 * Returns { from, to } pixel indices, or null.
 */
function nearestThroughCut(cut, w, h, sources, isTarget) {
  const prev = new Int32Array(w * h).fill(-1);
  const origin = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    prev[s] = s;
    origin[s] = s;
    queue[tail++] = s;
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (prev[j] !== -1) continue;
      if (isTarget(j)) return { from: origin[i], to: j };
      if (!cut[j]) continue; // other plate that is not a target: not a path
      prev[j] = i;
      origin[j] = origin[i];
      queue[tail++] = j;
    }
  }
  return null;
}

/**
 * Join every island of plate to the frame with straight bars of plate.
 *
 * Islands are taken largest first; each is bridged to the nearest plate that
 * is already connected to the frame, then counts as connected itself, so a
 * small island inside a large one bridges to the large one rather than
 * reaching all the way out. With `perIsland` 2, a second bar starts from the
 * island's far side, so a big island cannot pivot on one bar.
 *
 * Returns { cut (new array), bridges: [{x0,y0,x1,y1}], islands (count before) }.
 */
export function addBridges(cutIn, w, h, { width = 8, perIsland = 1 } = {}) {
  const cut = cutIn.slice();
  const bridges = [];
  const plate = () => {
    const p = new Uint8Array(w * h);
    for (let i = 0; i < p.length; i++) p[i] = cut[i] ? 0 : 1;
    return p;
  };
  let comps = labelComponents(plate(), w, h, 1, 4);
  const islandCount = comps.sizes.length - 1 - [...comps.edge].length;
  // Safety valve: every pass connects at least one island, so this is the
  // most passes there can be.
  for (let pass = 0; pass <= islandCount + 1; pass++) {
    const { labels, sizes, edge } = comps;
    if (!edge.size) break; // no frame at all; nothing to anchor to
    const islands = [];
    for (let id = 1; id < sizes.length; id++) if (!edge.has(id)) islands.push(id);
    if (!islands.length) break;
    islands.sort((a, b) => sizes[b] - sizes[a]);
    const isTarget = (j) => labels[j] !== 0 && edge.has(labels[j]);
    // Largest first, but an island walled in by another island cannot reach
    // connected plate yet; skip it this pass, its jailer goes first.
    let id = 0;
    let sources = [];
    let found = null;
    for (const candidate of islands) {
      sources = [];
      for (let i = 0; i < labels.length; i++) if (labels[i] === candidate) sources.push(i);
      found = nearestThroughCut(cut, w, h, sources, isTarget);
      if (found) {
        id = candidate;
        break;
      }
    }
    if (!found || !id) break;
    const add = (from, to) => {
      const x0 = from % w;
      const y0 = (from - x0) / w;
      const x1 = to % w;
      const y1 = (to - x1) / w;
      // Extend a little past both ends so the bar overlaps plate, not just
      // touches it at a pixel corner.
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const ex = ((x1 - x0) / len) * (width / 2);
      const ey = ((y1 - y0) / len) * (width / 2);
      stampBar(cut, w, h, x0 - ex, y0 - ey, x1 + ex, y1 + ey, width);
      bridges.push({ x0, y0, x1, y1 });
    };
    add(found.from, found.to);
    if (perIsland > 1 && sources.length > 1) {
      // Far side: island pixels more than half the island's reach away from
      // where the first bar starts.
      const fx = found.from % w;
      const fy = (found.from - fx) / w;
      let reach = 0;
      for (const s of sources) reach = Math.max(reach, Math.hypot((s % w) - fx, Math.floor(s / w) - fy));
      const far = sources.filter((s) => Math.hypot((s % w) - fx, Math.floor(s / w) - fy) > reach * 0.6);
      // The far side must be bridged to the frame-connected plate, which
      // may now include the first bar — pick paths that leave from far away.
      if (far.length && reach > width * 2) {
        const second = nearestThroughCut(cut, w, h, far, (j) => labels[j] !== 0 && edge.has(labels[j]));
        if (second) add(second.from, second.to);
      }
    }
    comps = labelComponents(plate(), w, h, 1, 4);
  }
  return { cut, bridges, islands: Math.max(0, islandCount) };
}

// ---------------------------------------------------------------------------
// contours
// ---------------------------------------------------------------------------

/**
 * Pixel-boundary contours of mask === 1, as closed rings of [x, y] corner
 * coordinates (pixel (x,y) spans x..x+1, y..y+1). Every edge is directed with
 * the inside on its left in y-down screen space, so outer rings and holes
 * come out with opposite signed area. At a saddle (two set pixels touching
 * only at a corner) the ring turns toward the inside, which keeps diagonal
 * pixels apart — the same 4-connectivity the rest of this file uses.
 */
export function traceContours(mask, w, h) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  // Directed edges keyed by start vertex. Vertex id = y * (w + 1) + x.
  const W = w + 1;
  const out = new Map();
  const push = (x0, y0, x1, y1) => {
    const k = y0 * W + x0;
    const list = out.get(k);
    const e = { x0, y0, x1, y1, used: false };
    if (list) list.push(e);
    else out.set(k, [e]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      // y-down: walking with the inside on the left means going
      // counter-clockwise on screen around a set pixel... choose: top edge
      // right-to-left, left edge top-to-bottom, bottom edge left-to-right,
      // right edge bottom-to-top.
      if (!inside(x, y - 1)) push(x + 1, y, x, y);
      if (!inside(x - 1, y)) push(x, y, x, y + 1);
      if (!inside(x, y + 1)) push(x, y + 1, x + 1, y + 1);
      if (!inside(x + 1, y)) push(x + 1, y + 1, x + 1, y);
    }
  }
  const rings = [];
  for (const list of out.values()) {
    for (const first of list) {
      if (first.used) continue;
      const ring = [];
      let e = first;
      while (e && !e.used) {
        e.used = true;
        ring.push([e.x0, e.y0]);
        const next = (out.get(e.y1 * W + e.x1) || []).filter((n) => !n.used);
        if (next.length <= 1) {
          e = next[0];
          continue;
        }
        // Saddle: prefer the turn toward the inside. Inside is on the left of
        // the direction of travel; in y-down coordinates "left" of (dx,dy) is
        // (dy,-dx).
        const dx = e.x1 - e.x0;
        const dy = e.y1 - e.y0;
        e = next.find((n) => n.x1 - n.x0 === dy && n.y1 - n.y0 === -dx) ?? next[0];
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}

/** Signed area (shoelace). In y-down space, outer rings here are negative. */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return a / 2;
}

/** Remove collinear vertices of an axis-aligned pixel ring. */
function dropCollinear(ring) {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n];
    const b = ring[i];
    const c = ring[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out.length >= 3 ? out : ring;
}

function perpendicular(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function douglasPeucker(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicular(points[i], points[s], points[e]);
      if (d > best) {
        best = d;
        idx = i;
      }
    }
    if (best > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Smooth a pixel staircase into a polygon: take edge midpoints (which turns
 * a 1px staircase into a straight diagonal), then Douglas-Peucker. The ring
 * stays within half a pixel of the true boundary.
 */
export function simplifyRing(ring, tol = 0.4) {
  const r = dropCollinear(ring);
  // Every edge contributes its midpoint, which turns a staircase into the
  // slope it approximates. A vertex between two long edges is a real corner
  // and is kept as well, so a rectangle stays a rectangle rather than
  // becoming the diamond its midpoints alone would make.
  const len = (a, b) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
  const CORNER = 3;
  const mids = [];
  for (let i = 0; i < r.length; i++) {
    const prev = r[(i - 1 + r.length) % r.length];
    const p = r[i];
    const q = r[(i + 1) % r.length];
    if (len(prev, p) >= CORNER && len(p, q) >= CORNER) mids.push([p[0], p[1]]);
    mids.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  }
  // Close by splitting at the two most distant points, so DP has fixed ends.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < mids.length; i++) {
    const d = (mids[i][0] - mids[0][0]) ** 2 + (mids[i][1] - mids[0][1]) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = douglasPeucker(mids.slice(0, far + 1), tol);
  const b = douglasPeucker([...mids.slice(far), mids[0]], tol);
  const out = cleanRing([...a.slice(0, -1), ...b.slice(0, -1)]);
  return out.length >= 3 ? out : r;
}

/**
 * Drop vertices that are (nearly) on the line through their neighbours, or
 * on top of one. Not cosmetic: earcut silently skips such a vertex when it
 * triangulates the cap while the side wall keeps it, and the mismatch is an
 * open edge in the STL.
 */
function cleanRing(ring, eps = 1e-6) {
  let pts = ring;
  for (let changed = true; changed && pts.length > 3;) {
    changed = false;
    const keep = [];
    for (let i = 0; i < pts.length; i++) {
      const a = keep.length ? keep[keep.length - 1] : pts[pts.length - 1];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const short = Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05;
      if (Math.abs(cross) < eps || short) changed = true;
      else keep.push(b);
    }
    if (keep.length < 3) break;
    pts = keep;
  }
  return pts;
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Rings -> shapes: [{ outer, holes: [] }]. A hole belongs to the smallest
 * outer ring containing it. Tested with a point just on the plate side of
 * the hole's first raw edge, which is inside its owner and in no other ring.
 */
export function buildShapes(rawRings, tol = 0.5) {
  const items = rawRings.map((raw) => ({ raw, area: ringArea(raw), ring: simplifyRing(raw, tol) }));
  const outers = items.filter((r) => r.area < 0).map((r) => ({ ...r, holes: [] }));
  for (const hole of items.filter((r) => r.area > 0)) {
    const [a, b] = [hole.raw[0], hole.raw[1]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    // Plate is on the left of travel: (dy, -dx) in y-down space.
    const probe = [(a[0] + b[0]) / 2 + dy * 0.25, (a[1] + b[1]) / 2 - dx * 0.25];
    let owner = null;
    for (const o of outers) {
      if ((!owner || -o.area < -owner.area) && pointInRing(probe, o.raw)) owner = o;
    }
    if (owner) owner.holes.push(hole.ring);
  }
  return outers.map((o) => ({ outer: o.ring, holes: o.holes }));
}

// ---------------------------------------------------------------------------
// the whole pipeline
// ---------------------------------------------------------------------------

/**
 * cut mask (px) + settings (mm) -> everything the page draws and exports.
 *
 * opts: mmPerPx, bridgeWidth, bridgesPerIsland, minCut, minPlate, speck
 *       (mm, mm, 1|2, mm, mm, mm^2)
 */
export function buildStencil(cutIn, w, h, opts = {}) {
  const {
    mmPerPx = 0.2, bridgeWidth = 1.6, bridgesPerIsland = 1, minCut = 0.6, minPlate = 0.8, speck = 0.5, bridges: wantBridges = true,
  } = opts;
  const px = (mm) => mm / mmPerPx;
  let cut = cutIn.slice();
  // The frame is plate, always: one pixel ring so the outline is defined and
  // every island has something to bridge to.
  for (let x = 0; x < w; x++) cut[x] = cut[(h - 1) * w + x] = 0;
  for (let y = 0; y < h; y++) cut[y * w] = cut[y * w + w - 1] = 0;

  const before = cut.reduce((a, v) => a + v, 0);
  cut = removeSmall(cut, w, h, Math.round(speck / (mmPerPx * mmPerPx)), 1);
  // A cut-out narrower than minCut lets no paint through; drop it rather
  // than print a slit that clogs. Opening by minCut/2.
  if (minCut > 0) cut = open(cut, w, h, px(minCut) / 2 - 0.5);
  const removed = before - cut.reduce((a, v) => a + v, 0);

  let bridgeList = [];
  let islands = 0;
  if (wantBridges) {
    const result = addBridges(cut, w, h, { width: Math.max(1, px(bridgeWidth)), perIsland: bridgesPerIsland });
    cut = result.cut;
    bridgeList = result.bridges;
    islands = result.islands;
  } else {
    const plate = Uint8Array.from(cut, (v) => (v ? 0 : 1));
    const comps = labelComponents(plate, w, h, 1, 4);
    islands = comps.sizes.length - 1 - comps.edge.size;
  }

  const plate = Uint8Array.from(cut, (v) => (v ? 0 : 1));
  // Plate thinner than minPlate: what an opening of the plate would remove.
  const thin = new Uint8Array(w * h);
  let thinCount = 0;
  if (minPlate > 0) {
    const opened = open(plate, w, h, px(minPlate) / 2 - 0.5);
    for (let i = 0; i < thin.length; i++) {
      if (plate[i] && !opened[i]) {
        thin[i] = 1;
        thinCount++;
      }
    }
  }
  const comps = labelComponents(plate, w, h, 1, 4);
  const loose = comps.sizes.length - 1 - comps.edge.size;

  const shapes = buildShapes(traceContours(plate, w, h)).map(({ outer, holes }) => ({
    outer: outer.map(([x, y]) => [x * mmPerPx, (h - y) * mmPerPx]),
    holes: holes.map((ring) => ring.map(([x, y]) => [x * mmPerPx, (h - y) * mmPerPx])),
  }));

  return {
    cut,
    plate,
    thin,
    shapes,
    bridges: bridgeList,
    stats: {
      widthMm: w * mmPerPx,
      heightMm: h * mmPerPx,
      islands,
      bridges: bridgeList.length,
      // Islands still not held by anything: only when bridges are off, or
      // when an island could not reach the frame at all.
      loose,
      cutAreaMm2: cut.reduce((a, v) => a + v, 0) * mmPerPx * mmPerPx,
      removedMm2: removed * mmPerPx * mmPerPx,
      thinMm2: thinCount * mmPerPx * mmPerPx,
      holes: shapes.reduce((a, s) => a + s.holes.length, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

/** Non-indexed triangle positions (x,y,z,...) -> binary STL. */
export function binaryStl(positions, name = "gdxlabs stencil") {
  const triangles = positions.length / 9;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(name.slice(0, 79));
  new Uint8Array(buffer, 0, 80).set(header);
  view.setUint32(80, triangles, true);
  let o = 84;
  for (let t = 0; t < triangles; t++) {
    const p = t * 9;
    const ax = positions[p + 3] - positions[p];
    const ay = positions[p + 4] - positions[p + 1];
    const az = positions[p + 5] - positions[p + 2];
    const bx = positions[p + 6] - positions[p];
    const by = positions[p + 7] - positions[p + 1];
    const bz = positions[p + 8] - positions[p + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(o, nx, true);
    view.setFloat32(o + 4, ny, true);
    view.setFloat32(o + 8, nz, true);
    o += 12;
    for (let k = 0; k < 9; k++, o += 4) view.setFloat32(o, positions[p + k], true);
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buffer;
}

/** Plate outline as an SVG (mm), for laser or plotter cutting. */
export function shapesToSvg(shapes, widthMm, heightMm) {
  const ring = (r) => `M${r.map(([x, y]) => `${x.toFixed(2)} ${(heightMm - y).toFixed(2)}`).join("L")}Z`;
  const d = shapes.map((s) => [s.outer, ...s.holes].map(ring).join("")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`
    + `<path d="${d}" fill="#000" fill-rule="evenodd"/></svg>`;
}
