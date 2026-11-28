'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  SCHEMA,
  POLICY,
  canonicalizeReviewPayload
} = require('../scripts/reviewer-attestation.cjs');
const { createReviewReleaseGate } = require('../backend/review-release-gate.cjs');

const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const REVIEWER = 'reviewer.synthetic.01';
const AUTHOR = 'author.synthetic.01';
const SOURCE_COMMIT = 'c'.repeat(40);

function fixture({ decision = 'approved', onPolicy = () => {}, onLoad = () => {} } = {}) {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const artifactBytes = Buffer.from('synthetic preview artifact v1');
  const reportBytes = Buffer.from('synthetic cheque review report v1');
  const payload = {
    schema: SCHEMA,
    policyId: POLICY,
    keyId: 'synthetic-release-key',
    reviewerId: REVIEWER,
    decision,
    sourceCommit: SOURCE_COMMIT,
    artifactSha256: crypto.createHash('sha256').update(artifactBytes).digest('hex'),
    reportSha256: crypto.createHash('sha256').update(reportBytes).digest('hex'),
    reviewedAt: new Date(NOW).toISOString(),
    nonce: crypto.randomBytes(16).toString('base64url')
  };
  const envelope = {
    payload,
    signature: crypto.sign(
      null,
      Buffer.from(canonicalizeReviewPayload(payload), 'utf8'),
      pair.privateKey
    ).toString('base64url')
  };
  const consumed = new Set();
  const material = { sourceCommit: SOURCE_COMMIT, artifactBytes, reportBytes };
  let materialLoads = 0;
  let authenticatedPrincipal = REVIEWER;
  const gate = createReviewReleaseGate({
    // Test-only stand-in for a server-validated session. It deliberately
    // ignores caller-controlled request fields such as principalId/reviewerId.
    authenticateReviewer: async () =>
      authenticatedPrincipal ? { id: authenticatedPrincipal } : null,
    isIndependentReviewer: async ({ reviewerId }) => { onPolicy(reviewerId); return reviewerId !== AUTHOR; },
    loadReleaseMaterial: async () => {
      onLoad();
      materialLoads += 1;
      return material;
    },
    trustedKeys: {
      'synthetic-release-key': {
        publicKey,
        reviewerId: REVIEWER,
        status: 'active'
      }
    },
    nonceStore: {
      async consume(nonce) {
        if (consumed.has(nonce)) return false;
        consumed.add(nonce);
        return true;
      }
    },
    clock: () => NOW
  });
  return {
    gate, envelope, material, consumed, reportBytes,
    setAuthenticatedPrincipal(value) { authenticatedPrincipal = value; },
    get materialLoads() { return materialLoads; }
  };
}

test('requires server authentication, independent-review policy, release loader, trusted keys and nonce store', () => {
  assert.throws(() => createReviewReleaseGate({}), /authenticator is required/);
});

test('does not load report material for an unauthenticated request', async () => {
  const f = fixture();
  f.setAuthenticatedPrincipal(null);
  await assert.rejects(
    f.gate({ request: { principalId: REVIEWER }, envelope: f.envelope }),
    /authenticated reviewer principal is required/
  );
  assert.equal(f.materialLoads, 0);
  assert.equal(f.consumed.size, 0);
});

test('rejects the authenticated author/deployer even when the request claims another reviewer', async () => {
  const f = fixture();
  f.setAuthenticatedPrincipal(AUTHOR);
  await assert.rejects(
    f.gate({ request: { principalId: REVIEWER, reviewerId: REVIEWER }, envelope: f.envelope }),
    /independently authenticated reviewer is required/
  );
  assert.equal(f.materialLoads, 0);
  assert.equal(f.consumed.size, 0);
});

test('fails closed on an indeterminate independence policy before loading report material', async () => {
  let materialLoads = 0;
  const gate = createReviewReleaseGate({
    authenticateReviewer: async () => ({ id: REVIEWER }),
    isIndependentReviewer: async () => undefined,
    loadReleaseMaterial: async () => {
      materialLoads += 1;
      return { sourceCommit: SOURCE_COMMIT, artifactBytes: Buffer.from('x'), reportBytes: Buffer.from('y') };
    },
    trustedKeys: {},
    nonceStore: { async consume() { return true; } },
    clock: () => NOW
  });
  await assert.rejects(
    gate({ request: {}, envelope: {} }),
    /independently authenticated reviewer is required/
  );
  assert.equal(materialLoads, 0);
});

test('ignores caller-supplied reviewer identities and uses only the authenticated server principal', async () => {
  const f = fixture();
  const result = await f.gate({
    request: { principalId: AUTHOR, reviewerId: AUTHOR },
    envelope: f.envelope
  });
  assert.deepEqual(result.reportBytes, f.reportBytes);
  assert.equal(result.receipt.verified, true);
  assert.equal(result.receipt.reviewerId, REVIEWER);
  assert.equal(result.receipt.sourceCommit, SOURCE_COMMIT);
  assert.equal(f.materialLoads, 1);
  assert.equal(f.consumed.has(f.envelope.payload.nonce), true);
});

test('checks reviewer independence before loading release material', async () => {
  const events = [];
  const f = fixture({
    onPolicy: () => events.push('independence-policy'),
    onLoad: () => events.push('release-material')
  });
  const result = await f.gate({
    request: { principalId: REVIEWER },
    envelope: f.envelope
  });
  assert.equal(result.receipt.verified, true);
  assert.deepEqual(events, ['independence-policy', 'release-material']);
});

test('blocks release when the server-loaded artifact bytes differ from the signed artifact', async () => {
  const f = fixture();
  f.material.artifactBytes = Buffer.from('tampered synthetic artifact');
  await assert.rejects(
    f.gate({ request: { principalId: REVIEWER }, envelope: f.envelope }),
    /does not match expected artifactSha256/
  );
  assert.equal(f.consumed.size, 0);
});

test('blocks release when the server-loaded report bytes differ from the signed report', async () => {
  const f = fixture();
  f.material.reportBytes = Buffer.from('tampered synthetic report');
  await assert.rejects(
    f.gate({ request: { principalId: REVIEWER }, envelope: f.envelope }),
    /does not match expected reportSha256/
  );
  assert.equal(f.consumed.size, 0);
});

test('never releases a signed rejection', async () => {
  const f = fixture({ decision: 'rejected' });
  await assert.rejects(
    f.gate({ request: { principalId: REVIEWER }, envelope: f.envelope }),
    /Rejected review cannot authorize report release/
  );
  assert.equal(f.consumed.size, 0);
});

test('prevents a second report release with the same signed approval', async () => {
  const f = fixture();
  const request = { principalId: REVIEWER };
  const first = await f.gate({ request, envelope: f.envelope });
  assert.deepEqual(first.reportBytes, f.reportBytes);
  await assert.rejects(
    f.gate({ request, envelope: f.envelope }),
    /nonce was already used/
  );
});

test('rejects malformed server release material instead of accepting caller-supplied hashes', async () => {
  const f = fixture();
  f.material.reportHash = 'e'.repeat(64);
  await assert.rejects(
    f.gate({ request: { principalId: REVIEWER }, envelope: f.envelope }),
    /missing or unexpected fields/
  );
  assert.equal(f.consumed.size, 0);
});
