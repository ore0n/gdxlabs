import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

import { JobStore, jobId } from "../src/jobs.js";
import { RateLimiter } from "../src/ratelimit.js";
import { createApp } from "../src/server.js";
import { loadConfig, validateConfig } from "../src/config.js";
import {
  backoffMs, Ledger, libraryEntries, localClock, MAX_ATTEMPTS, Nightly, parsePrompts, parseWindow, windowOpen,
} from "../src/precache.js";

// 2026-03-10 02:30 in Vienna (UTC+1) is 01:30 UTC.
const NIGHT = Date.UTC(2026, 2, 10, 1, 30);
const NOON = Date.UTC(2026, 2, 10, 11, 0);
const VIENNA = "Europe/Vienna";

function rig({ now = NIGHT, perDay = 5, draw, prompts = ["a wolf", "a fox", "a bear"], idleMs = 30_000 } = {}) {
  const clock = { t: now };
  const drawn = [];
  const store = new JobStore({
    model: "m", now: () => clock.t,
    draw: draw ?? (async (prompt) => { drawn.push(prompt); return { svg: `<svg>${prompt}</svg>`, viewBox: "0 0 1 1", stats: {} }; }),
  });
  const ledger = new Ledger("", () => clock.t);
  const nightly = new Nightly({
    store, prompts, ledger, window: parseWindow("01:00-06:00"), tz: VIENNA, perDay, idleMs, now: () => clock.t, log: () => {},
  });
  return { clock, drawn, store, ledger, nightly };
}

test("windows: parsing, wrapping and local time", () => {
  assert.deepEqual(parseWindow("01:00-06:00"), { from: 60, to: 360 });
  assert.equal(parseWindow("nonsense"), null);
  assert.equal(parseWindow("25:00-06:00"), null);
  assert.ok(windowOpen(parseWindow("22:00-04:00"), 23 * 60));
  assert.ok(windowOpen(parseWindow("22:00-04:00"), 60));
  assert.ok(!windowOpen(parseWindow("22:00-04:00"), 12 * 60));
  assert.deepEqual(localClock(NIGHT, VIENNA), { day: "2026-03-10", minutes: 150 });
  assert.equal(localClock(Date.UTC(2026, 2, 9, 23, 5), VIENNA).minutes, 5, "midnight is minute 0, not 1440");
});

test("the prompt list: comments, blanks, duplicates and unusable lines", () => {
  const list = parsePrompts("# c\n\n a   wolf \nA WOLF\nx\n" + "y".repeat(300) + "\na fox\n");
  assert.deepEqual(list, ["a wolf", "a fox"]);
});

test("outside the window nothing is drawn", async () => {
  const { nightly, drawn } = rig({ now: NOON });
  assert.equal(await nightly.tick(), "window");
  assert.deepEqual(drawn, []);
});

test("inside the window one motif is drawn per tick, in list order, until the budget", async () => {
  const { nightly, drawn, ledger } = rig({ perDay: 2 });
  assert.equal(await nightly.tick(), "drew");
  assert.equal(await nightly.tick(), "drew");
  assert.equal(await nightly.tick(), "budget");
  assert.deepEqual(drawn, ["a wolf", "a fox"]);
  assert.equal(ledger.count, 2);
});

test("the budget resets with the local day", async () => {
  const { nightly, clock, drawn } = rig({ perDay: 1 });
  await nightly.tick();
  assert.equal(await nightly.tick(), "budget");
  clock.t += 24 * 60 * 60_000;
  assert.equal(await nightly.tick(), "drew");
  assert.deepEqual(drawn, ["a wolf", "a fox"]);
});

test("a motif that is already drawn is skipped, and a finished list says complete", async () => {
  const { nightly, store, drawn } = rig({ prompts: ["a wolf", "a fox"] });
  await store.waitFor(await store.submit("a wolf"));
  assert.equal(await nightly.tick(), "drew");
  assert.deepEqual(drawn, ["a wolf", "a fox"], "the first came from the visitor, the second from the loop");
  assert.equal(await nightly.tick(), "complete");
});

test("visitors win: busy queue and recent visitors hold the loop back", async () => {
  const gate = {};
  gate.promise = new Promise((resolve) => { gate.resolve = resolve; });
  const { nightly, store, clock } = rig({ draw: async () => { await gate.promise; return { svg: "<svg/>" }; } });
  const visitorJob = await store.submit("a visitor prompt");
  assert.equal(await nightly.tick(), "busy");
  gate.resolve();
  await store.waitFor(visitorJob);

  store.noteVisitor();
  assert.equal(await nightly.tick(), "visitor");
  clock.t += 31_000;
  assert.equal(await nightly.tick(), "drew");
});

test("a failing prompt backs off by days and gives up after MAX_ATTEMPTS", async () => {
  const day = 24 * 60 * 60_000;
  const { nightly, clock, drawn, store } = rig({
    prompts: ["a bad one", "a good one"], perDay: 100,
    draw: async (prompt) => { if (prompt === "a bad one") throw new Error("boom"); return { svg: "<svg/>" }; },
  });
  assert.equal(await nightly.tick(), "drew"); // bad: attempt 1
  assert.equal(await nightly.tick(), "drew"); // good is drawn instead, not the bad one again
  assert.equal(store.view(await store.lookup("a good one")).status, "done");
  assert.equal(await nightly.tick(), "complete");

  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
    clock.t += backoffMs(attempt - 1) + 1;
    assert.equal(await nightly.tick(), "drew", `attempt ${attempt}`);
    // keep inside the window: jump back to the night
    clock.t = Math.floor(clock.t / day) * day + NIGHT % day;
  }
  clock.t += 100 * day;
  clock.t = Math.floor(clock.t / day) * day + NIGHT % day;
  assert.equal(await nightly.tick(), "complete", "after MAX_ATTEMPTS it is left alone");
  assert.equal(drawn.length, 0);
});

test("the ledger survives a restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-"));
  try {
    const file = join(dir, "_precache.json");
    const a = await new Ledger(file).load();
    a.rollover("2026-03-10");
    await a.drew("x");
    await a.failed("y");
    const b = await new Ledger(file).load();
    b.rollover("2026-03-10");
    assert.equal(b.count, 2);
    assert.equal(b.due("y"), false);
    b.rollover("2026-03-11");
    assert.equal(b.count, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("library lists only drawn motifs, in list order; the svg route serves them", async () => {
  const { store, nightly } = rig({ prompts: ["a wolf", "a fox", "a bear"] });
  await nightly.tick();
  await nightly.tick();
  const prompts = ["a bear", "a fox", "a wolf"];
  const items = await libraryEntries(store, prompts);
  assert.deepEqual(items.map((i) => i.prompt), ["a fox", "a wolf"]);

  const config = { ...loadConfig({}), allowedOrigins: ["*"] };
  const server = createServer(createApp(config, { store, limiter: new RateLimiter({ capacity: 5, refillMs: 1000 }), prompts }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const library = await (await fetch(`${base}/api/stencil/library`)).json();
    assert.deepEqual(library.items.map((i) => i.prompt), ["a fox", "a wolf"]);
    const svg = await fetch(`${base}/api/stencil/jobs/${library.items[0].id}.svg`);
    assert.equal(svg.status, 200);
    assert.equal(svg.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.match(svg.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(await svg.text(), "<svg>a fox</svg>");
    assert.equal((await fetch(`${base}/api/stencil/jobs/${jobId("m", "a bear")}.svg`)).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("config: the pre-cache needs a prompts file and a real window", () => {
  const base = { LITELLM_URL: "https://llm", LITELLM_API_KEY: "sk-1", PRECACHE_ENABLED: "1" };
  assert.match(validateConfig(loadConfig(base)).join(), /PROMPTS_FILE/);
  assert.deepEqual(validateConfig(loadConfig({ ...base, PROMPTS_FILE: "/p", PRECACHE_TZ: "Europe/Vienna" })), []);
  assert.match(validateConfig(loadConfig({ ...base, PROMPTS_FILE: "/p", PRECACHE_WINDOW: "late" })).join(), /window/);
  assert.match(validateConfig(loadConfig({ ...base, PROMPTS_FILE: "/p", PRECACHE_TZ: "Mars/Base" })).join(), /time zone/);
});
