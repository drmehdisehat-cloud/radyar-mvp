'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { consumeHumanReviewAttestation } = require('../backend/human-review-replay-ledger.cjs');
const { canonicalizePayload } = require('../scripts/verify-human-review-attestation.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-review-replay-'));
  const ledgerDirectory = path.join(root, 'ledger');
  fs.mkdirSync(ledgerDirectory, { mode: 0o700 });
  fs.chmodSync(ledgerDirectory, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const now = Date.now();
  const payload = {
    schema: 'dadyar-human-review-attestation-v2',
    issuer: 'synthetic-owner-review-registry',
    subject: 'synthetic-reviewer-01',
    audience: 'dadyar-preview-release',
    decision: 'approved',
    review_id: crypto.randomUUID(),
    source_commit: 'a'.repeat(40),
    source_blob_sha1: 'c'.repeat(40),
    artifact_sha256: 'b'.repeat(64),
    reviewed_at: new Date(now - 30000).toISOString(),
    expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(32).toString('base64url')
  };
  const trustStore = {
    schema: 'dadyar-review-trust-store-v1',
    issuer: payload.issuer,
    reviewers: [{
      subject: payload.subject,
      roles: ['preview-reviewer'],
      active: true,
      public_key_pem: publicKey.export({ type: 'spki', format: 'pem' })
    }]
  };
  const attestation = {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload), 'utf8'), privateKey).toString('base64url')
  };
  return {
    root, ledgerDirectory, now, payload, trustStore, attestation, privateKey,
    expectedSourceCommit: payload.source_commit,
    expectedSourceBlobSha1: payload.source_blob_sha1,
    expectedArtifactSha256: payload.artifact_sha256
  };
}

function resign(f, patch) {
  const payload = { ...f.payload, ...patch };
  return {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload), 'utf8'), f.privateKey).toString('base64url')
  };
}

function consume(f, overrides = {}) {
  return consumeHumanReviewAttestation({
    attestation: f.attestation,
    trustStore: f.trustStore,
    expectedSourceCommit: f.expectedSourceCommit,
    expectedSourceBlobSha1: f.expectedSourceBlobSha1,
    expectedArtifactSha256: f.expectedArtifactSha256,
    ledgerDirectory: f.ledgerDirectory,
    now: f.now,
    ...overrides
  });
}

function runChild(code, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error('child_exit_' + code + ':' + stderr));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error('child_invalid_json:' + stdout + ':' + stderr)); }
    });
  });
}

test('consumes a valid signed review once and rejects an exact replay', t => {
  const f = fixture(t);
  const first = consume(f);
  assert.equal(first.consumed, true);
  assert.equal(first.sourceCommit, f.payload.source_commit);
  assert.equal(first.artifactSha256, f.payload.artifact_sha256);
  assert.equal(consume(f).reason, 'review_attestation_replayed');
  assert.equal(fs.readdirSync(f.ledgerDirectory).length, 2);
});

test('does not write replay markers for an invalid signature', t => {
  const f = fixture(t);
  f.attestation.signature = Buffer.alloc(64).toString('base64url');
  assert.equal(consume(f).reason, 'invalid_signature');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('rejects reuse of review_id with a fresh nonce', t => {
  const f = fixture(t);
  assert.equal(consume(f).consumed, true);
  f.attestation = resign(f, { nonce: crypto.randomBytes(32).toString('base64url') });
  assert.equal(consume(f).reason, 'review_attestation_replayed');
});

test('rejects reuse of nonce with a fresh review_id', t => {
  const f = fixture(t);
  assert.equal(consume(f).consumed, true);
  f.attestation = resign(f, { review_id: crypto.randomUUID() });
  assert.equal(consume(f).reason, 'review_attestation_replayed');
});

test('rejects a ledger inside the Git checkout', t => {
  const f = fixture(t);
  const checkout = path.resolve(__dirname, '..');
  const result = consume(f, { ledgerDirectory: path.join(checkout, 'tests') });
  assert.equal(result.reason, 'replay_ledger_unavailable');
  assert.equal(result.detail, 'ledger_directory_must_be_disjoint_from_git_checkout');
});

test('rejects a symlinked ledger directory', t => {
  const f = fixture(t);
  const alias = path.join(f.root, 'ledger-alias');
  fs.symlinkSync(f.ledgerDirectory, alias, 'dir');
  const result = consume(f, { ledgerDirectory: alias });
  assert.equal(result.reason, 'replay_ledger_unavailable');
  assert.equal(result.detail, 'ledger_path_contains_symlink');
});

test('rejects a ledger directory readable or writable by group or others', t => {
  const f = fixture(t);
  fs.chmodSync(f.ledgerDirectory, 0o755);
  const result = consume(f);
  assert.equal(result.reason, 'replay_ledger_unavailable');
  assert.equal(result.detail, 'ledger_directory_permissions_invalid');
  assert.deepEqual(fs.readdirSync(f.ledgerDirectory), []);
});

test('stores only digests, not raw reviewer, review id or nonce', t => {
  const f = fixture(t);
  assert.equal(consume(f).consumed, true);
  for (const name of fs.readdirSync(f.ledgerDirectory)) {
    assert.doesNotMatch(name, new RegExp(f.payload.nonce));
    const content = fs.readFileSync(path.join(f.ledgerDirectory, name), 'utf8');
    assert.doesNotMatch(content, new RegExp(f.payload.nonce));
    assert.doesNotMatch(content, new RegExp(f.payload.review_id));
    assert.doesNotMatch(content, new RegExp(f.payload.subject));
  }
});

test('concurrent processes can consume the same approval exactly once', async t => {
  const f = fixture(t);
  const input = path.join(f.root, 'synthetic-attestation.json');
  fs.writeFileSync(input, JSON.stringify({
    attestation: f.attestation,
    trustStore: f.trustStore,
    expectedSourceCommit: f.expectedSourceCommit,
    expectedSourceBlobSha1: f.expectedSourceBlobSha1,
    expectedArtifactSha256: f.expectedArtifactSha256,
    now: f.now
  }), { mode: 0o600 });
  const modulePath = path.resolve(__dirname, '../backend/human-review-replay-ledger.cjs');
  const code = [
    "const fs=require('node:fs');",
    "const {consumeHumanReviewAttestation}=require(" + JSON.stringify(modulePath) + ");",
    'const f=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));',
    'const result=consumeHumanReviewAttestation({...f,ledgerDirectory:process.argv[2]});',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const results = await Promise.all(Array.from({ length: 8 }, () => runChild(code, [input, f.ledgerDirectory])));
  assert.equal(results.filter(result => result.consumed === true).length, 1);
  assert.equal(results.filter(result => result.reason === 'review_attestation_replayed').length, 7);
  assert.equal(fs.readdirSync(f.ledgerDirectory).length, 2);
});
