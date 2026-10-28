'use strict';
// Synthetic-only regression: the development limiter must fail closed if a
// supplied clock cannot represent an exact millisecond expiry.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../backend/rate-limit');

test('reject fractional, negative and overflowed clocks without resetting quota', () => {
  let time = 100;
  const allow = createRateLimiter({ max: 1, windowMs: 1000, now: () => time });
  assert.equal(allow('synthetic-a'), true);
  for (const badTime of [-1, 100.5, Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER - 999, 1e100]) {
    time = badTime;
    assert.equal(allow('synthetic-a'), false, 'unsafe clock must fail closed');
    assert.equal(allow('synthetic-b'), false, 'unsafe clock must not allocate peer buckets');
  }
  time = 101;
  assert.equal(allow('synthetic-a'), false, 'invalid calls must not reset existing quota');
  time = 1100;
  assert.equal(allow('synthetic-a'), true, 'valid expiry remains usable');
});

test('permit a safe exact expiry at the numeric boundary', () => {
  const time = Number.MAX_SAFE_INTEGER - 1000;
  const allow = createRateLimiter({ max: 1, windowMs: 1000, now: () => time });
  assert.equal(allow('synthetic-boundary'), true);
  assert.equal(allow('synthetic-boundary'), false);
});
