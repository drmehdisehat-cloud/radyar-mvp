'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveOwnerPinnedReviewTrustStoreSha256 } = require('../scripts/preview-release-preflight.cjs');

const VALID = 'a'.repeat(64);

test('requires a non-zero owner-managed trust-store digest', () => {
  for (const value of [undefined, '', 'x'.repeat(64), '0'.repeat(64), 42]) {
    const result = resolveOwnerPinnedReviewTrustStoreSha256(undefined, {
      DADYAR_REVIEW_TRUST_STORE_SHA256: value
    });
    assert.equal(result.digest, null);
    assert.equal(result.reason, 'owner_managed_review_trust_store_pin_missing_or_invalid');
  }
});

test('normalizes an owner-managed trust-store digest and permits an omitted CLI cross-check', () => {
  assert.deepEqual(
    resolveOwnerPinnedReviewTrustStoreSha256(undefined, {
      DADYAR_REVIEW_TRUST_STORE_SHA256: VALID.toUpperCase()
    }),
    { digest: VALID, reason: null }
  );
});

test('treats a matching CLI digest only as a consistency assertion', () => {
  assert.deepEqual(
    resolveOwnerPinnedReviewTrustStoreSha256(VALID, {
      DADYAR_REVIEW_TRUST_STORE_SHA256: VALID
    }),
    { digest: VALID, reason: null }
  );
});

test('rejects a caller-supplied digest that differs from the owner-managed pin', () => {
  const result = resolveOwnerPinnedReviewTrustStoreSha256('b'.repeat(64), {
    DADYAR_REVIEW_TRUST_STORE_SHA256: VALID
  });
  assert.equal(result.digest, null);
  assert.equal(result.reason, 'review_trust_store_cli_pin_mismatch');
});

test('operator guide documents the out-of-band trust anchor and fail-closed behavior', () => {
  const guide = fs.readFileSync(path.join(__dirname, '../docs/HUMAN-REVIEW-ATTESTATION.md'), 'utf8');
  assert.match(guide, /DADYAR_REVIEW_TRUST_STORE_SHA256/);
  assert.match(guide, /گزینه CLI صرفاً کنترل تطابق است/);
  assert.match(guide, /بدون آن، حتی گواهی امضاشده/);
});
