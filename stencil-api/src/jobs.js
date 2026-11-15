/**
 * Stencil jobs: prompt in, sanitised one-colour SVG out, one draw at a time.
 *
 * A job's id is a hash of the route, the prompt version and the normalised
 * prompt. The route derives its noise seed from the prompt, so the same
 * prompt always draws the same picture — which makes the id a cache key as
 * well: asking twice costs one draw, and a finished stencil is served from
 * disk for ever.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

import { extractSvg, sanitiseSvg } from "./svg.js";

/** Bump when the same prompt would come out different. Part of the id. */
export const PROMPT_VERSION = 1;

export const MIN_PROMPT = 3;
export const MAX_PROMPT = 240;

export class PromptError extends Error {}

export function normalisePrompt(input) {
  if (typeof input !== "string") throw new PromptError("prompt must be text");
  // Control characters out, whitespace collapsed: two prompts that look the
  // same are the same job.
  const prompt = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (prompt.length < MIN_PROMPT) throw new PromptError(`prompt must be at least ${MIN_PROMPT} characters`);
  if (prompt.length > MAX_PROMPT) throw new PromptError(`prompt must be at most ${MAX_PROMPT} characters`);
  return prompt;
}

export function jobId(model, prompt) {
  return createHash("sha256").update(`${model}\n${PROMPT_VERSION}\n${prompt.toLowerCase()}`).digest("hex").slice(0, 20);
}

export class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** One call to the platform route. */
export async function drawStencil({ url, key, model, prompt, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${url}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (error) {
    throw new UpstreamError(error.name === "AbortError" ? `no answer from ${model} in ${timeoutMs / 1000}s` : `platform unreachable: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.message ?? detail;
    } catch {
      // not JSON; keep the raw text
    }
    throw new UpstreamError(`platform answered ${response.status}: ${detail}`, response.status);
  }
  const body = JSON.parse(text);
  const content = body?.choices?.[0]?.message?.content;
  const { svg, viewBox } = sanitiseSvg(extractSvg(content));
  const stats = body?.blob_diffuser ?? {};
  return {
    svg,
    viewBox,
    stats: {
      drawMs: stats.draw_ms ?? null,
      cutouts: stats.cutouts ?? null,
      islands: stats.islands ?? null,
      bytes: Buffer.byteLength(svg),
    },
  };
}

export class JobStore {
  /**
   * `draw(prompt)` is injected so tests run without a platform.
   * `cacheDir` may be empty: jobs then live only in memory.
   */
  constructor({ model, draw, cacheDir = "", maxQueued = 12, now = Date.now }) {
    this.model = model;
    this.draw = draw;
    this.cacheDir = cacheDir;
    this.maxQueued = maxQueued;
    this.now = now;
    this.jobs = new Map();
    this.queue = [];
    this.running = null;
    this.idle = Promise.resolve();
  }

  async #load(id) {
    if (!this.cacheDir) return null;
    try {
      return JSON.parse(await readFile(join(this.cacheDir, `${id}.json`), "utf8"));
    } catch {
      return null;
    }
  }

  async #save(job) {
    if (!this.cacheDir) return;
    await mkdir(this.cacheDir, { recursive: true });
    const target = join(this.cacheDir, `${job.id}.json`);
    await writeFile(`${target}.tmp`, JSON.stringify(job));
    await rename(`${target}.tmp`, target);
  }

  view(job) {
    const out = { id: job.id, status: job.status, prompt: job.prompt };
    if (job.status === "queued") out.position = this.queue.indexOf(job.id) + 1;
    if (job.status === "done") Object.assign(out, { svg: job.svg, viewBox: job.viewBox, stats: job.stats });
    if (job.status === "failed") out.error = job.error;
    return out;
  }

  /**
   * The job this prompt already has — queued, running or drawn — or null if
   * asking for it would cost a draw. A failed job counts as none, so it can
   * be asked for again. Throws PromptError for an unusable prompt.
   */
  async lookup(rawPrompt) {
    const prompt = normalisePrompt(rawPrompt);
    const id = jobId(this.model, prompt);
    const known = this.jobs.get(id);
    if (known) return known.status === "failed" ? null : known;
    const cached = await this.#load(id);
    if (cached?.status === "done") {
      this.#remember(cached);
      return cached;
    }
    return null;
  }

  #remember(job) {
    this.jobs.set(job.id, job);
    // Finished jobs are on disk; memory only needs the recent ones.
    if (this.jobs.size > 500) {
      for (const [id, old] of this.jobs) {
        if (this.jobs.size <= 400) break;
        if (old.status === "done" || old.status === "failed") this.jobs.delete(id);
      }
    }
  }

  /** Queue a draw. Returns the job (an existing one if there is one). */
  async submit(rawPrompt) {
    const existing = await this.lookup(rawPrompt);
    if (existing) return existing;
    const prompt = normalisePrompt(rawPrompt);
    const id = jobId(this.model, prompt);
    if (this.queue.length >= this.maxQueued) {
      const error = new Error("the stencil queue is full; try again in a few minutes");
      error.busy = true;
      throw error;
    }
    const job = { id, prompt, status: "queued", created: this.now() };
    this.#remember(job);
    this.queue.push(id);
    this.#pump();
    return job;
  }

  async get(id) {
    if (!/^[0-9a-f]{20}$/.test(id)) return null;
    const job = this.jobs.get(id) ?? (await this.#load(id));
    if (job && !this.jobs.has(id)) this.#remember(job);
    return job ?? null;
  }

  #pump() {
    if (this.running || !this.queue.length) return;
    const id = this.queue.shift();
    const job = this.jobs.get(id);
    job.status = "running";
    job.started = this.now();
    this.running = (async () => {
      try {
        Object.assign(job, await this.draw(job.prompt), { status: "done", finished: this.now() });
        await this.#save(job).catch((error) => console.error(`cache write failed for ${id}: ${error.message}`));
      } catch (error) {
        Object.assign(job, { status: "failed", error: error.message, finished: this.now() });
        console.error(`stencil ${id} failed: ${error.message}`);
      } finally {
        this.running = null;
        this.#pump();
      }
    })();
    this.idle = this.running;
  }
}
