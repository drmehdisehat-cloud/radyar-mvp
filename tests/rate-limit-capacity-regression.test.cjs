'use strict';
// Synthetic regression for development-only limiter capacity and clock failures.
// This does not establish staging security or replace authentication.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../backend/rate-limit');

test('cap distinct peer buckets without evicting active quotas', () => {
  let time = 100;
  const allow = createRateLimiter({ max: 2, windowMs: 1000, maxPeers: 2, now: () => time });
  assert.equal(allow('synthetic-a'), true);
  assert.equal(allow('synthetic-b'), true);
  assert.equal(allow('synthetic-c'), false, 'new peer cannot allocate a third active bucket');
  assert.equal(allow('synthetic-a'), true, 'existing peer retains its remaining quota');
  assert.equal(allow('synthetic-a'), false, 'existing peer quota is not reset by capacity pressure');
  time = 1100;
  assert.equal(allow('synthetic-c'), true, 'expired peer buckets can be reclaimed');
  assert.equal(allow('synthetic-a'), true, 'expired existing peer can start a new window');
});

test('reject invalid peer capacity and clock configuration', () => {
  for (const config of [
    { maxPeers: 0 }, { maxPeers: -1 }, { maxPeers: 1.5 },
    { maxPeers: Infinity }, { maxPeers: '2' }, { now: 42 },
  ]) assert.throws(() => createRateLimiter(config), TypeError);
});

test('invalid clock values fail closed instead of resetting a quota', () => {
  let time = 100;
  const allow = createRateLimiter({ max: 1, windowMs: 1000, now: () => time });
  assert.equal(allow('synthetic-a'), true);
  time = NaN;
  assert.equal(allow('synthetic-a'), false);
  time = Infinity;
  assert.equal(allow('synthetic-b'), false);
  time = 101;
  assert.equal(allow('synthetic-a'), false);
  time = 1100;
  assert.equal(allow('synthetic-a'), true);
});
