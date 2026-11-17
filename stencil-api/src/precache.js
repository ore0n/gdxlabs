/**
 * The nightly loop: draws a list of ready-made motifs while nobody is waiting,
 * so the page's Library is full and popular prompts are instant.
 *
 * Modelled on AllBlobs' pre-cache (ore0n/allblobs api/src/precache.js) and
 * deliberately smaller. A loop inside the API process rather than a CronJob,
 * for the same reasons: the queue and the cache already live here, and the
 * queue must stay single-worker.
 *
 *   - Only inside PRECACHE_WINDOW (local time in PRECACHE_TZ).
 *   - At most PRECACHE_PER_DAY draws a day.
 *   - Only when nothing is queued or running and no visitor has asked for
 *     anything for PRECACHE_IDLE_MS. A visitor can still arrive mid-draw and
 *     waits for that one stencil, never for a backlog.
 *   - A prompt that failed is left alone for a day, then two, then four, and
 *     after MAX_ATTEMPTS never again — otherwise one undrawable prompt is
 *     retried first every night for ever.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { jobId, normalisePrompt, PromptError } from "./jobs.js";

const DAY_MS = 24 * 60 * 60_000;
export const MAX_ATTEMPTS = 4;

// ---- time windows (same rules as AllBlobs) --------------------------------

export function parseWindow(text) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ""));
  if (!match) return null;
  const [fromH, fromM, toH, toM] = match.slice(1).map(Number);
  if (fromH > 23 || toH > 23 || fromM > 59 || toM > 59) return null;
  return { from: fromH * 60 + fromM, to: toH * 60 + toM };
}

/** Local day and minute-of-day in `tz`. `% 24`: some ICU builds print midnight as hour 24. */
export function localClock(at, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(at)).map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

/** Windows may wrap past midnight; a zero-width one means always. */
export function windowOpen(window, minutes) {
  if (!window) return false;
  if (window.from === window.to) return true;
  if (window.from < window.to) return minutes >= window.from && minutes < window.to;
  return minutes >= window.from || minutes < window.to;
}

export function backoffMs(attempts) {
  return DAY_MS * 2 ** Math.max(0, attempts - 1);
}

// ---- the list --------------------------------------------------------------

/** One prompt per line; blank lines and `#` comments ignored; duplicates and unusable lines dropped. */
export function parsePrompts(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    try {
      const prompt = normalisePrompt(line);
      const key = prompt.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(prompt);
      }
    } catch (error) {
      if (!(error instanceof PromptError)) throw error;
    }
  }
  return out;
}

export async function loadPrompts(file) {
  if (!file) return [];
  try {
    return parsePrompts(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** The list's prompts that have been drawn, as `{id, prompt}`, in list order. */
export async function libraryEntries(store, prompts) {
  const out = [];
  for (const prompt of prompts) {
    const job = await store.lookup(prompt);
    if (job?.status === "done") out.push({ id: job.id, prompt: job.prompt });
  }
  return out;
}

// ---- the ledger ------------------------------------------------------------

/** What was drawn today and what failed, in one small JSON file next to the cache. */
export class Ledger {
  constructor(file, now = Date.now) {
    this.file = file;
    this.now = now;
    this.state = { day: "", count: 0, failures: {} };
  }

  async load() {
    if (!this.file) return this;
    try {
      this.state = { ...this.state, ...JSON.parse(await readFile(this.file, "utf8")) };
    } catch {
      // first run, or unreadable: start clean
    }
    return this;
  }

  async #save() {
    if (!this.file) return;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state));
    await rename(`${this.file}.tmp`, this.file);
  }

  rollover(day) {
    if (this.state.day !== day) this.state = { ...this.state, day, count: 0 };
  }

  get count() {
    return this.state.count;
  }

  due(id) {
    const f = this.state.failures[id];
    if (!f) return true;
    return f.attempts < MAX_ATTEMPTS && this.now() >= f.nextAt;
  }

  async drew(id) {
    this.state.count += 1;
    delete this.state.failures[id];
    await this.#save();
  }

  async failed(id) {
    const attempts = (this.state.failures[id]?.attempts ?? 0) + 1;
    this.state.failures[id] = { attempts, nextAt: this.now() + backoffMs(attempts) };
    // A failed draw cost a slot too: a model that fails everything must not
    // be asked all night.
    this.state.count += 1;
    await this.#save();
  }
}

// ---- the loop --------------------------------------------------------------

export class Nightly {
  constructor({ store, prompts, ledger, window, tz, perDay, idleMs = 30_000, pollMs = 5_000, now = Date.now, sleep, log = console.log }) {
    Object.assign(this, { store, prompts, ledger, window, tz, perDay, idleMs, pollMs, now, log });
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.stopped = false;
  }

  /** One step. Returns why nothing was drawn, or "drew". */
  async tick() {
    const clock = localClock(this.now(), this.tz);
    if (!windowOpen(this.window, clock.minutes)) return "window";
    this.ledger.rollover(clock.day);
    if (this.ledger.count >= this.perDay) return "budget";
    if (this.store.running || this.store.queue.length) return "busy";
    if (this.now() - this.store.lastVisitorAt < this.idleMs) return "visitor";

    let next = null;
    for (const prompt of this.prompts) {
      // Anything already drawn, queued or running is skipped; a failed job
      // reads as none, so the ledger decides when it may be retried.
      if ((await this.store.lookup(prompt)) === null && this.ledger.due(jobId(this.store.model, prompt))) {
        next = prompt;
        break;
      }
    }
    if (!next) return "complete";

    const job = await this.store.waitFor(await this.store.submit(next));
    if (job.status === "done") {
      await this.ledger.drew(job.id);
      this.log(`precache: drew "${job.prompt}" (${this.ledger.count}/${this.perDay} today)`);
    } else {
      await this.ledger.failed(job.id);
      this.log(`precache: "${job.prompt}" failed: ${job.error}`);
    }
    return "drew";
  }

  async run() {
    while (!this.stopped) {
      let reason;
      try {
        reason = await this.tick();
      } catch (error) {
        this.log(`precache: ${error.message}`);
        reason = "error";
      }
      const wait = reason === "drew" ? 0 : ["window", "budget", "complete", "error"].includes(reason) ? 60_000 : this.pollMs;
      await this.sleep(wait);
    }
  }

  stop() {
    this.stopped = true;
  }
}
