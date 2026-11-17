/**
 * Configuration, read once at start and validated loudly — a missing key
 * would otherwise surface minutes later as a 401 on someone's first draw.
 */

function int(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value, fallback) {
  const items = String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

export function loadConfig(env = process.env) {
  const config = {
    port: int(env.PORT, 8080),
    host: env.HOST ?? "0.0.0.0",
    litellmUrl: (env.LITELLM_URL ?? "").replace(/\/+$/, ""),
    litellmKey: env.LITELLM_API_KEY ?? "",
    // The platform route. Its key should be scoped to this name alone.
    model: env.STENCIL_MODEL ?? "stencil-diffuser",
    // Strictly above the route's own 900s LiteLLM timeout, so the platform
    // gives up first and says which upstream failed.
    timeoutMs: int(env.GENERATE_TIMEOUT_MS, 960_000),
    cacheDir: env.STENCIL_CACHE_DIR ?? "",
    allowedOrigins: list(env.ALLOWED_ORIGINS, ["https://www.gdxlabs.com", "https://gdxlabs.com"]),
    // Draws per client: a burst of `rateBurst`, then one per `rateRefillMs`.
    rateBurst: int(env.RATE_BURST, 3),
    rateRefillMs: int(env.RATE_REFILL_MS, 10 * 60_000),
    // Jobs waiting behind the one being drawn. The model slot is exclusive,
    // so past this the honest answer is "busy", not a 40-minute queue.
    maxQueued: int(env.MAX_QUEUED, 12),
    // Ready-made motifs, one prompt per line. Drawn overnight when the
    // pre-cache is on, and listed on the page's Library tab once drawn.
    promptsFile: env.PROMPTS_FILE ?? "",
    precache: {
      enabled: ["1", "true", "yes", "on"].includes(String(env.PRECACHE_ENABLED ?? "").toLowerCase()),
      windowText: env.PRECACHE_WINDOW ?? "01:00-06:00",
      tz: env.PRECACHE_TZ ?? "UTC",
      perDay: int(env.PRECACHE_PER_DAY, 20),
      // Quiet time after the last visitor request before a background draw.
      idleMs: int(env.PRECACHE_IDLE_MS, 30_000),
      pollMs: int(env.PRECACHE_POLL_MS, 5_000),
    },
    trustProxy: ["1", "true", "yes"].includes(String(env.TRUST_PROXY ?? "").toLowerCase()),
  };
  return config;
}

export function validateConfig(config) {
  const problems = [];
  if (!/^https?:\/\//.test(config.litellmUrl)) problems.push("LITELLM_URL must be an http(s) URL");
  if (!config.litellmKey.startsWith("sk-")) problems.push("LITELLM_API_KEY must be a LiteLLM key (sk-...)");
  if (config.precache.enabled) {
    if (!config.promptsFile) problems.push("PRECACHE_ENABLED needs PROMPTS_FILE");
    if (!/^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*$/.test(config.precache.windowText)) problems.push(`PRECACHE_WINDOW ${JSON.stringify(config.precache.windowText)} is not a window like 01:00-06:00`);
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: config.precache.tz });
    } catch {
      problems.push(`PRECACHE_TZ ${JSON.stringify(config.precache.tz)} is not a time zone`);
    }
  }
  return problems;
}
