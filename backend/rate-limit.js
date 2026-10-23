'use strict';
// Development-only, in-memory limiter. Not a replacement for authentication or a gateway.
function createRateLimiter({ max = 30, windowMs = 60_000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError('invalid rate limit configuration');
  }
  const entries = new Map();
  let requests = 0;
  return function allow(ip) {
    const time = now();
    // Periodically discard expired entries to bound stale data growth.
    if (++requests % 128 === 0) {
      for (const [key, item] of entries) if (time >= item.until) entries.delete(key);
    }
    const key = String(ip || 'unknown');
    let item = entries.get(key);
    if (!item || time >= item.until) {
      item = { count: 0, until: time + windowMs };
      entries.set(key, item);
    }
    item.count++;
    return item.count <= max;
  };
}
module.exports = { createRateLimiter };
