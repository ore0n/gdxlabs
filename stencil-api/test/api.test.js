import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

import { createApp } from "../src/server.js";
import { drawStencil, JobStore, jobId, normalisePrompt, PromptError } from "../src/jobs.js";
import { RateLimiter } from "../src/ratelimit.js";
import { loadConfig, validateConfig } from "../src/config.js";

const RING = '<?xml version="1.0"?><svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
  + '<path d="M0 0 C10 0 20 0 30 0 Z M5 5 L10 5 L10 10 Z" fill="#000000"/><script>alert(1)</script></svg>';

function fakeFetch(reply, status = 200, calls = []) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return new Response(JSON.stringify(reply), { status });
  };
}

async function serve(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test("prompts are normalised and bounded", () => {
  assert.equal(normalisePrompt("  a   wolf\nhead "), "a wolf head");
  assert.throws(() => normalisePrompt("ab"), PromptError);
  assert.throws(() => normalisePrompt("x".repeat(241)), PromptError);
  assert.throws(() => normalisePrompt(42), PromptError);
});

test("the id ignores case and whitespace but not the route", () => {
  assert.equal(jobId("m", normalisePrompt("A  Wolf")), jobId("m", normalisePrompt("a wolf")));
  assert.notEqual(jobId("m", "a wolf"), jobId("other", "a wolf"));
});

test("drawStencil calls the route and returns a sanitised svg", async () => {
  const calls = [];
  const result = await drawStencil({
    url: "https://llm.example", key: "sk-test", model: "stencil-diffuser", prompt: "a wolf", timeoutMs: 1000,
    fetchImpl: fakeFetch({ choices: [{ message: { content: RING } }], blob_diffuser: { draw_ms: 1200, islands: 1, cutouts: 1 } }, 200, calls),
  });
  assert.equal(calls[0].url, "https://llm.example/v1/chat/completions");
  assert.equal(calls[0].body.model, "stencil-diffuser");
  assert.equal(calls[0].body.messages[0].content, "a wolf");
  assert.equal(calls[0].auth, "Bearer sk-test");
  assert.ok(!result.svg.includes("script"));
  assert.equal(result.viewBox, "0 0 100 100");
  assert.equal(result.stats.islands, 1);
});

test("an upstream error names the status and the platform's message", async () => {
  await assert.rejects(
    drawStencil({
      url: "https://x", key: "sk-x", model: "m", prompt: "p", timeoutMs: 1000,
      fetchImpl: fakeFetch({ error: { message: "key not allowed to access model" } }, 401),
    }),
    /401: key not allowed/,
  );
});

test("one draw at a time, deduplicated, cached to disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stencil-"));
  try {
    const gates = [];
    let draws = 0;
    const store = new JobStore({
      model: "m", cacheDir: dir,
      draw: async () => {
        draws++;
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
        return { svg: "<svg/>", viewBox: "0 0 1 1", stats: {} };
      },
    });
    const a = await store.submit("a wolf");
    const again = await store.submit("A  wolf");
    const b = await store.submit("a fox");
    assert.equal(again, a);
    assert.equal(store.view(a).status, "running");
    assert.equal(store.view(b).status, "queued");
    assert.equal(store.view(b).position, 1);
    assert.equal(draws, 1);

    gates[0].resolve();
    await store.idle;
    await new Promise((r) => setImmediate(r));
    assert.equal(store.view(a).status, "done");
    assert.equal(draws, 2);
    gates[1].resolve();
    await store.idle;

    // A fresh store finds the drawn stencil on disk without drawing.
    const reborn = new JobStore({ model: "m", cacheDir: dir, draw: async () => assert.fail("should not draw") });
    const cached = await reborn.lookup("a wolf");
    assert.equal(cached.status, "done");
    assert.equal(cached.svg, "<svg/>");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a full queue says busy rather than queueing for ever", async () => {
  const store = new JobStore({ model: "m", maxQueued: 1, draw: () => new Promise(() => {}) });
  await store.submit("one one");
  await store.submit("two two");
  await assert.rejects(store.submit("three three"), (error) => error.busy === true);
});

test("a failed job can be asked for again", async () => {
  let fail = true;
  const store = new JobStore({ model: "m", draw: async () => { if (fail) throw new Error("boom"); return { svg: "<svg/>" }; } });
  const job = await store.submit("a wolf");
  await store.idle;
  assert.equal(store.view(job).status, "failed");
  assert.equal(store.view(job).error, "boom");
  assert.equal(await store.lookup("a wolf"), null);
  fail = false;
  const retry = await store.submit("a wolf");
  await store.idle;
  assert.equal(store.view(retry).status, "done");
});

test("http: submit, poll, CORS, rate limit", async () => {
  const config = { ...loadConfig({}), allowedOrigins: ["https://www.gdxlabs.com"] };
  const gate = deferred();
  const store = new JobStore({ model: "m", draw: async () => { await gate.promise; return { svg: "<svg/>", viewBox: "0 0 1 1", stats: {} }; } });
  const limiter = new RateLimiter({ capacity: 1, refillMs: 60_000 });
  const { base, close } = await serve(createApp(config, { store, limiter }));
  try {
    const origin = { origin: "https://www.gdxlabs.com", "content-type": "application/json" };
    const pre = await fetch(`${base}/api/stencil/jobs`, { method: "OPTIONS", headers: origin });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "https://www.gdxlabs.com");

    const created = await fetch(`${base}/api/stencil/jobs`, { method: "POST", headers: origin, body: JSON.stringify({ prompt: "a wolf" }) });
    assert.equal(created.status, 202);
    assert.equal(created.headers.get("access-control-allow-origin"), "https://www.gdxlabs.com");
    const { id, status } = await created.json();
    assert.equal(status, "running");
    gate.resolve();
    await store.idle;

    const polled = await (await fetch(`${base}/api/stencil/jobs/${id}`)).json();
    assert.equal(polled.status, "done");
    assert.equal(polled.svg, "<svg/>");

    // The same prompt again is free, a new one is over the limit.
    const same = await fetch(`${base}/api/stencil/jobs`, { method: "POST", headers: origin, body: JSON.stringify({ prompt: "a wolf" }) });
    assert.equal(same.status, 200);
    const limited = await fetch(`${base}/api/stencil/jobs`, { method: "POST", headers: origin, body: JSON.stringify({ prompt: "a fox" }) });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);

    const bad = await fetch(`${base}/api/stencil/jobs`, { method: "POST", headers: origin, body: JSON.stringify({ prompt: "x" }) });
    assert.equal(bad.status, 400);

    const foreign = await fetch(`${base}/api/stencil/jobs`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    assert.equal(foreign.status, 403);
    assert.equal((await fetch(`${base}/api/stencil/jobs/nothex`)).status, 404);
  } finally {
    await close();
  }
});

test("config refuses to start without a usable key", () => {
  assert.deepEqual(validateConfig(loadConfig({ LITELLM_URL: "https://llm", LITELLM_API_KEY: "sk-1" })), []);
  assert.equal(validateConfig(loadConfig({})).length, 2);
});
