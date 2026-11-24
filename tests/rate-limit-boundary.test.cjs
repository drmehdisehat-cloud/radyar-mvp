'use strict';
// Synthetic tests for the local-only in-memory throttle. Not a production security gate.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../backend/rate-limit');

test('reject invalid quota and window configurations', () => {
  for (const config of [
    { max: 0 }, { max: -1 }, { max: 1.5 }, { max: Infinity },
    { windowMs: 0 }, { windowMs: -10 }, { windowMs: NaN },
  ]) assert.throws(() => createRateLimiter(config), TypeError);
});

test('enforce a per-peer quota without leaking another peer quota', () => {
  const allow = createRateLimiter({ max: 2, windowMs: 1000, now: () => 100 });
  assert.equal(allow('synthetic-a'), true);
  assert.equal(allow('synthetic-a'), true);
  assert.equal(allow('synthetic-a'), false);
  assert.equal(allow('synthetic-b'), true);
  assert.equal(allow('synthetic-b'), true);
  assert.equal(allow('synthetic-b'), false);
});

test('reset quota only at the expiry boundary', () => {
  let now = 200;
  const allow = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
  assert.equal(allow('synthetic-a'), true);
  now = 1199;
  assert.equal(allow('synthetic-a'), false);
  now = 1200;
  assert.equal(allow('synthetic-a'), true);
  assert.equal(allow('synthetic-a'), false);
});

test('unknown peer identifier has a shared, limited bucket', () => {
  const allow = createRateLimiter({ max: 1, now: () => 100 });
  assert.equal(allow(undefined), true);
  assert.equal(allow(null), false);
  assert.equal(allow('unknown'), false);
});
