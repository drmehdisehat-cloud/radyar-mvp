'use strict';
// Development-only, in-memory limiter. Not a replacement for authentication or a gateway.
// Bound both requests per peer and distinct peer buckets to avoid unbounded memory use
// if this module is reused by an experimental staging harness.
function createRateLimiter({ max = 30, windowMs = 60_000, maxPeers = 1024, now = Date.now } = {}) {
  if (!Number.isSafeInteger(max) || max < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1 ||
      !Number.isSafeInteger(maxPeers) || maxPeers < 1 ||
      typeof now !== 'function') {
    throw new TypeError('invalid rate limit configuration');
  }
  const entries = new Map();
  let requests = 0;
  function discardExpired(time) {
    for (const [key, item] of entries) {
      if (time >= item.until) entries.delete(key);
    }
  }
  return function allow(ip) {
    const time = now();
    // An invalid clock cannot safely establish an expiry boundary.
    if (!Number.isFinite(time)) return false;
    if (++requests % 128 === 0) discardExpired(time);
    const key = String(ip || 'unknown');
    let item = entries.get(key);
    if (!item || time >= item.until) {
      if (!item && entries.size >= maxPeers) {
        discardExpired(time);
        // Fail closed instead of evicting an active peer's quota.
        if (entries.size >= maxPeers) return false;
      }
      item = { count: 0, until: time + windowMs };
      entries.set(key, item);
    }
    item.count++;
    return item.count <= max;
  };
}
module.exports = { createRateLimiter };
