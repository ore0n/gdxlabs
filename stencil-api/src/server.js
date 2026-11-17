/**
 * The stencil API behind www.gdxlabs.com/stencil/.
 *
 * The site is static (GitHub Pages), so it cannot hold the LiteLLM key; this
 * service does, and exposes exactly one thing with it: "draw this prompt as a
 * stencil". Everything after the SVG — threshold, bridges, plate, STL — runs
 * in the visitor's browser.
 *
 *   POST /api/stencil/jobs        {"prompt": "..."}  -> 202 {id, status, position}
 *                                                        200 when already drawn
 *   GET  /api/stencil/jobs/:id                       -> {id, status, svg?, error?}
 *   GET  /api/healthz | /api/readyz
 *
 * Standard-library Node only, like the AllBlobs API it is modelled on.
 */

import { createServer } from "node:http";

import { loadConfig, validateConfig } from "./config.js";
import { drawStencil, JobStore, PromptError } from "./jobs.js";
import { RateLimiter } from "./ratelimit.js";
import { libraryEntries, Ledger, loadPrompts, Nightly, parseWindow } from "./precache.js";

const MAX_BODY = 4 * 1024;

function clientId(req, trustProxy) {
  if (trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? "unknown";
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new PromptError("request too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new PromptError("body must be JSON");
  }
}

export function createApp(config, { store, limiter, prompts = [] }) {
  const allowed = new Set(config.allowedOrigins);

  function send(req, res, status, body, headers = {}) {
    const origin = req.headers.origin;
    const cors = origin && (allowed.has(origin) || allowed.has("*"))
      ? { "access-control-allow-origin": origin, vary: "Origin" }
      : {};
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...cors,
      ...headers,
    });
    res.end(JSON.stringify(body));
  }

  return async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (req.method === "OPTIONS") {
        const origin = req.headers.origin;
        if (!origin || !(allowed.has(origin) || allowed.has("*"))) return send(req, res, 403, { error: "origin not allowed" });
        res.writeHead(204, {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
          vary: "Origin",
        });
        return res.end();
      }
      if (path === "/api/healthz" || path === "/api/readyz") {
        return send(req, res, 200, { ok: true, model: config.model, queued: store.queue.length, running: Boolean(store.running) });
      }
      if (path === "/api/stencil/library" && req.method === "GET") {
        // The ready-made motifs that have been drawn. Thumbnails come from the .svg route.
        return send(req, res, 200, { items: await libraryEntries(store, prompts) }, { "cache-control": "public, max-age=300" });
      }
      const svgMatch = /^\/api\/stencil\/jobs\/([0-9a-f]{20})\.svg$/.exec(path);
      if (svgMatch && req.method === "GET") {
        const job = await store.get(svgMatch[1]);
        if (job?.status !== "done") return send(req, res, 404, { error: "no such stencil" });
        res.writeHead(200, {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=86400",
          "x-content-type-options": "nosniff",
          "cross-origin-resource-policy": "cross-origin",
          // A stencil is a picture; nothing in it should ever run.
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        });
        return res.end(job.svg);
      }
      if (path === "/api/stencil/jobs" && req.method === "POST") {
        store.noteVisitor();
        const body = await readJson(req);
        // Rate-limit only work that would cost a draw: a known prompt is free.
        let job = await store.lookup(body.prompt);
        if (!job) {
          const verdict = limiter.take(clientId(req, config.trustProxy));
          if (!verdict.allowed) {
            return send(req, res, 429, { error: "too many stencils; wait a little", retryAfterMs: verdict.retryAfterMs },
              { "retry-after": String(Math.ceil(verdict.retryAfterMs / 1000)) });
          }
          job = await store.submit(body.prompt);
        }
        return send(req, res, job.status === "done" ? 200 : 202, store.view(job));
      }
      const match = /^\/api\/stencil\/jobs\/([^/]+)$/.exec(path);
      if (match && req.method === "GET") {
        const job = await store.get(match[1]);
        if (!job) return send(req, res, 404, { error: "no such job" });
        return send(req, res, 200, store.view(job));
      }
      return send(req, res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof PromptError) return send(req, res, 400, { error: error.message });
      if (error.busy) return send(req, res, 503, { error: error.message }, { "retry-after": "120" });
      console.error(error);
      return send(req, res, 500, { error: "internal error" });
    }
  };
}

export function main() {
  const config = loadConfig();
  const problems = validateConfig(config);
  if (problems.length) {
    for (const problem of problems) console.error(`config: ${problem}`);
    process.exit(1);
  }
  const store = new JobStore({
    model: config.model,
    cacheDir: config.cacheDir,
    maxQueued: config.maxQueued,
    draw: (prompt) => drawStencil({
      url: config.litellmUrl, key: config.litellmKey, model: config.model, prompt, timeoutMs: config.timeoutMs,
    }),
  });
  const limiter = new RateLimiter({ capacity: config.rateBurst, refillMs: config.rateRefillMs });
  loadPrompts(config.promptsFile).then(async (prompts) => {
    const server = createServer(createApp(config, { store, limiter, prompts }));
    server.listen(config.port, config.host, () => {
      console.log(`stencil-api on :${config.port}, route ${config.model} at ${config.litellmUrl}, origins ${config.allowedOrigins.join(" ")}, library ${prompts.length} motifs`);
    });
    let nightly = null;
    if (config.precache.enabled) {
      const { windowText, tz, perDay, idleMs, pollMs } = config.precache;
      const ledger = await new Ledger(config.cacheDir ? `${config.cacheDir}/_precache.json` : "").load();
      nightly = new Nightly({ store, prompts, ledger, window: parseWindow(windowText), tz, perDay, idleMs, pollMs });
      nightly.run();
      console.log(`precache on: ${prompts.length} motifs, ${windowText} ${tz}, ${perDay}/day`);
    }
    for (const signal of ["SIGTERM", "SIGINT"]) {
      process.on(signal, () => {
        nightly?.stop();
        server.close(() => process.exit(0));
      });
    }
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
