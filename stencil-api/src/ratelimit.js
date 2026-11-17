// Copied verbatim from ore0n/allblobs api/src/ratelimit.js — keep the two in step.
/**
 * Per-client token bucket.
 *
 * Generation is the expensive thing on this site: one request occupies the
 * platform's only local model slot for up to a couple of minutes, and while it
 * does, nobody else's blob is being drawn. So the limit is not about abuse in
 * the abstract — it is about one visitor with a loop being able to take the
 * forge away from everyone.
 *
 * A bucket rather than a fixed window so that someone who rolls three blobs in
 * a row while deciding is not punished, but a script is.
 */
export class RateLimiter {
  /**
   * @param {number} capacity  burst — how many rolls back to back
   * @param {number} refillMs  how long one token takes to come back
   */
  constructor({ capacity = 5, refillMs = 60_000, now = Date.now, maxClients = 10_000 } = {}) {
    this.capacity = capacity;
    this.refillMs = refillMs;
    this.now = now;
    this.maxClients = maxClients;
    this.buckets = new Map();
  }

  #bucket(id) {
    let bucket = this.buckets.get(id);
    if (!bucket) {
      bucket = { tokens: this.capacity, updated: this.now() };
      // Bounded so the map cannot become the memory leak. Eviction is oldest
      // first, and an evicted client simply gets a full bucket back — which is
      // correct: it has not been seen in long enough to be rate limited.
      if (this.buckets.size >= this.maxClients) {
        this.buckets.delete(this.buckets.keys().next().value);
      }
    } else {
      this.buckets.delete(id);
    }
    this.buckets.set(id, bucket);
    return bucket;
  }

  /** Returns `{ allowed, retryAfterMs, remaining }` and spends a token if allowed. */
  take(id) {
    const bucket = this.#bucket(id);
    const now = this.now();
    const gained = (now - bucket.updated) / this.refillMs;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + gained);
    bucket.updated = now;

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        retryAfterMs: Math.ceil((1 - bucket.tokens) * this.refillMs),
        remaining: 0,
      };
    }
    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0, remaining: Math.floor(bucket.tokens) };
  }
}
