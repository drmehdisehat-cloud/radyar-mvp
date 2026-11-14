'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../scripts/verify-restore-attestation-signatures.cjs');
const { canonicalizeManifest, verifyRestoreAttestationSignatures, readExternalFile } = require('../scripts/verify-restore-attestation-signatures.cjs');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function makeManifest() {
  const now = Date.now();
  return {
    evidence: 'independent-restore-manifest-v1',
    restore_proven: true,
    archive_sha256: digest('synthetic archive'),
    restored_marker_sha256: digest('synthetic marker'),
    restore_log_sha256: digest('synthetic restore log'),
    database_probe_sha256: digest('synthetic database probe'),
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'synthetic-isolated-target',
    restore_operator: 'Synthetic Operator',
    independent_reviewer: 'Synthetic Reviewer',
    restore_database_name: 'synthetic_restore_db',
    production_database_name: 'synthetic_live_db',
    restore_database_user: 'synthetic_restore_user',
    production_database_user: 'synthetic_live_user',
    restore_target_path: '/srv/synthetic/restore',
    restore_target_realpath: '/srv/synthetic/restore',
    production_document_root: '/srv/site/public_html',
    production_document_root_realpath: '/srv/site/public_html',
    restore_completed_at: new Date(now - 120000).toISOString(),
    reviewed_at: new Date(now - 60000).toISOString()
  };
}
function signer() {
  const pair = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: pair.privateKey
  };
}
function signed(manifest, operator = signer(), reviewer = signer()) {
  const bytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  return {
    operator, reviewer,
    operatorSignature: crypto.sign(null, bytes, operator.privateKey),
    reviewerSignature: crypto.sign(null, bytes, reviewer.privateKey)
  };
}

test('canonical manifest serialization is stable across object key order', () => {
  assert.equal(canonicalizeManifest({ z: 1, a: { y: true, x: 'چک' } }), canonicalizeManifest({ a: { x: 'چک', y: true }, z: 1 }));
  assert.equal(canonicalizeManifest([1, 'x', null]), '[1,"x",null]');
});

test('two distinct Ed25519 signatures verify but never prove a restore or authorize deployment', () => {
  const manifest = makeManifest();
  const proof = signed(manifest);
  const result = verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem: proof.operator.publicKey,
    reviewerPublicKeyPem: proof.reviewer.publicKey,
    operatorSignature: proof.operatorSignature,
    reviewerSignature: proof.reviewerSignature
  });
  assert.equal(result.status, 'SIGNATURES_VERIFIED_UNTRUSTED_KEY_IDENTITY');
  assert.equal(result.signature_verified, true);
  assert.equal(result.restore_operation_independently_verified, false);
  assert.equal(result.deployment_authorized, false);
  assert.equal(result.manifest_sha256, digest(canonicalizeManifest(manifest)));
  assert.notEqual(result.operator_public_key_sha256, result.reviewer_public_key_sha256);
});

test('manifest tampering invalidates both detached signatures', () => {
  const manifest = makeManifest();
  const proof = signed(manifest);
  manifest.archive_sha256 = digest('tampered archive');
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem: proof.operator.publicKey,
    reviewerPublicKeyPem: proof.reviewer.publicKey,
    operatorSignature: proof.operatorSignature,
    reviewerSignature: proof.reviewerSignature
  }), /operator_signature_invalid/);
});

test('operator and reviewer cannot reuse the same Ed25519 key', () => {
  const manifest = makeManifest();
  const proof = signed(manifest);
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem: proof.operator.publicKey,
    reviewerPublicKeyPem: proof.operator.publicKey,
    operatorSignature: proof.operatorSignature,
    reviewerSignature: proof.operatorSignature
  }), /keys_must_be_distinct/);
});

test('a valid operator signature cannot compensate for an invalid reviewer signature', () => {
  const manifest = makeManifest();
  const proof = signed(manifest);
  const other = signer();
  const badReviewerSignature = crypto.sign(null, Buffer.from(canonicalizeManifest(manifest)), other.privateKey);
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem: proof.operator.publicKey,
    reviewerPublicKeyPem: proof.reviewer.publicKey,
    operatorSignature: proof.operatorSignature,
    reviewerSignature: badReviewerSignature
  }), /reviewer_signature_invalid/);
});

test('rejects non-Ed25519 keys and malformed signature lengths', () => {
  const manifest = makeManifest();
  const proof = signed(manifest);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem: rsa.publicKey.export({ type: 'spki', format: 'pem' }),
    reviewerPublicKeyPem: proof.reviewer.publicKey,
    operatorSignature: proof.operatorSignature,
    reviewerSignature: proof.reviewerSignature
  }), /must_be_ed25519/);
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest,
    operatorPublicKeyPem: proof.operator.publicKey,
    reviewerPublicKeyPem: proof.reviewer.publicKey,
    operatorSignature: Buffer.alloc(63),
    reviewerSignature: proof.reviewerSignature
  }), /exactly_64_bytes/);
});

test('rejects structurally incomplete manifests and same-person attestations', () => {
  const manifest = makeManifest();
  const proof = signed(manifest);
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest: { ...manifest, database_probe_passed: false },
    operatorPublicKeyPem: proof.operator.publicKey,
    reviewerPublicKeyPem: proof.reviewer.publicKey,
    operatorSignature: proof.operatorSignature,
    reviewerSignature: proof.reviewerSignature
  }), /schema_or_consistency_invalid/);
  const samePerson = { ...manifest, independent_reviewer: manifest.restore_operator };
  const sameProof = signed(samePerson);
  assert.throws(() => verifyRestoreAttestationSignatures({
    manifest: samePerson,
    operatorPublicKeyPem: sameProof.operator.publicKey,
    reviewerPublicKeyPem: sameProof.reviewer.publicKey,
    operatorSignature: sameProof.operatorSignature,
    reviewerSignature: sameProof.reviewerSignature
  }), /schema_or_consistency_invalid/);
});

test('rejects non-JSON values and prototype-pollution keys during canonicalization', () => {
  assert.throws(() => canonicalizeManifest({ value: undefined }), /non_json_value/);
  assert.throws(() => canonicalizeManifest({ value: Number.NaN }), /non_finite_number/);
  const polluted = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => canonicalizeManifest(polluted), /forbidden_key/);
});

test('external evidence reader rejects symlinks and files inside the checkout', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-attestation-reader-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'evidence.bin');
  const alias = path.join(directory, 'alias.bin');
  fs.writeFileSync(file, Buffer.from('synthetic evidence'));
  assert.equal(readExternalFile(file, 'evidence', 64).toString(), 'synthetic evidence');
  fs.symlinkSync(file, alias);
  assert.throws(() => readExternalFile(alias, 'evidence', 64), /path_contains_symlink/);
  assert.throws(() => readExternalFile(__filename, 'evidence', 64 * 1024), /outside_git_checkout/);
});

test('CLI canonicalizes and verifies two detached signatures using only external files', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-attestation-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manifest = makeManifest();
  const proof = signed(manifest);
  const files = {
    manifest: path.join(directory, 'restore.json'),
    operatorPublic: path.join(directory, 'operator.pub.pem'),
    reviewerPublic: path.join(directory, 'reviewer.pub.pem'),
    operatorSignature: path.join(directory, 'operator.sig'),
    reviewerSignature: path.join(directory, 'reviewer.sig')
  };
  fs.writeFileSync(files.manifest, JSON.stringify(manifest));
  fs.writeFileSync(files.operatorPublic, proof.operator.publicKey);
  fs.writeFileSync(files.reviewerPublic, proof.reviewer.publicKey);
  fs.writeFileSync(files.operatorSignature, proof.operatorSignature);
  fs.writeFileSync(files.reviewerSignature, proof.reviewerSignature);
  const canonical = spawnSync(process.execPath, [SCRIPT, '--canonicalize', '--manifest', files.manifest], { encoding: 'utf8' });
  assert.equal(canonical.status, 0, canonical.stderr);
  assert.equal(canonical.stdout.trim(), canonicalizeManifest(manifest));
  const verified = spawnSync(process.execPath, [SCRIPT,
    '--manifest', files.manifest,
    '--operator-public-key', files.operatorPublic,
    '--operator-signature', files.operatorSignature,
    '--reviewer-public-key', files.reviewerPublic,
    '--reviewer-signature', files.reviewerSignature
  ], { encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr);
  const output = JSON.parse(verified.stdout);
  assert.equal(output.signature_verified, true);
  assert.equal(output.restore_operation_independently_verified, false);
  assert.equal(output.deployment_authorized, false);
  fs.writeFileSync(files.manifest, JSON.stringify({ ...manifest, archive_sha256: digest('tampered') }));
  const tampered = spawnSync(process.execPath, [SCRIPT,
    '--manifest', files.manifest,
    '--operator-public-key', files.operatorPublic,
    '--operator-signature', files.operatorSignature,
    '--reviewer-public-key', files.reviewerPublic,
    '--reviewer-signature', files.reviewerSignature
  ], { encoding: 'utf8' });
  assert.equal(tampered.status, 1);
  assert.equal(JSON.parse(tampered.stdout).status, 'NOT_VERIFIED');
});


test('CLI rejects invalid UTF-8 manifest bytes instead of replacement decoding', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-attestation-invalid-utf8-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manifest = path.join(directory, 'restore.json');
  fs.writeFileSync(manifest, Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
  const result = spawnSync(process.execPath, [SCRIPT, '--canonicalize', '--manifest', manifest], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error, 'manifest_is_not_valid_utf8');
});


test('external evidence reader rejects FIFOs without blocking', t => {
  if (process.platform === 'win32') return t.skip('mkfifo is POSIX-only');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-attestation-fifo-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fifo = path.join(directory, 'evidence.pipe');
  const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (created.error || created.status !== 0) return t.skip('mkfifo unavailable');

  // Run in a child with a hard timeout: a blocking open must fail this test,
  // but must never stall the entire Node test runner.
  const modulePath = path.join(__dirname, '../scripts/verify-restore-attestation-signatures.cjs');
  const childSource = [
    'const { readExternalFile } = require(' + JSON.stringify(modulePath) + ');',
    'try { readExternalFile(' + JSON.stringify(fifo) + ', "evidence", 64); process.exitCode = 0; }',
    'catch (error) { process.stdout.write(String(error.message)); process.exitCode = 1; }'
  ].join('\\n');
  const result = spawnSync(process.execPath, ['-e', childSource], { encoding: 'utf8', timeout: 2000 });
  assert.notEqual(result.error?.code, 'ETIMEDOUT', 'FIFO evidence path must not block the verifier');
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /evidence_must_be_regular_file/);
});
