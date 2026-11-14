'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { canonicalizeManifest, readExternalFile } = require('../scripts/verify-restore-attestation-signatures.cjs');

const SCRIPT = path.join(__dirname, '../scripts/verify-restore-attestation-pinned.cjs');
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
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const der = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  return {
    publicKey,
    privateKey: pair.privateKey,
    fingerprint: digest(der)
  };
}

function createBundle(directory) {
  const manifest = makeManifest();
  const operator = signer();
  const reviewer = signer();
  const canonical = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const files = {
    manifest: path.join(directory, 'restore.json'),
    operatorPublic: path.join(directory, 'operator.pub.pem'),
    reviewerPublic: path.join(directory, 'reviewer.pub.pem'),
    operatorSignature: path.join(directory, 'operator.sig'),
    reviewerSignature: path.join(directory, 'reviewer.sig')
  };
  fs.writeFileSync(files.manifest, JSON.stringify(manifest));
  fs.writeFileSync(files.operatorPublic, operator.publicKey);
  fs.writeFileSync(files.reviewerPublic, reviewer.publicKey);
  fs.writeFileSync(files.operatorSignature, crypto.sign(null, canonical, operator.privateKey));
  fs.writeFileSync(files.reviewerSignature, crypto.sign(null, canonical, reviewer.privateKey));
  return { files, manifest, operator, reviewer };
}

function argsFor(bundle) {
  const f = bundle.files;
  return [
    '--manifest', f.manifest,
    '--operator-public-key', f.operatorPublic,
    '--operator-signature', f.operatorSignature,
    '--reviewer-public-key', f.reviewerPublic,
    '--reviewer-signature', f.reviewerSignature,
    '--expected-operator-public-key-sha256', bundle.operator.fingerprint,
    '--expected-reviewer-public-key-sha256', bundle.reviewer.fingerprint
  ];
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('valid signatures plus independently supplied fingerprints match, without authorizing deployment', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-restore-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  const result = run(argsFor(bundle));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'SIGNATURES_VERIFIED_AND_FINGERPRINTS_MATCHED');
  assert.equal(output.key_fingerprints_pinned, true);
  assert.equal(output.signer_identity_independently_verified, false);
  assert.equal(output.restore_operation_independently_verified, false);
  assert.equal(output.deployment_authorized, false);
});

test('rejects an operator key whose fingerprint differs from the out-of-band pin', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-operator-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  const args = argsFor(bundle);
  args[args.indexOf('--expected-operator-public-key-sha256') + 1] = '0'.repeat(64);
  const result = run(args);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /operator_public_key_fingerprint_mismatch/);
});

test('rejects a reviewer key whose fingerprint differs from the out-of-band pin', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-reviewer-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  const args = argsFor(bundle);
  args[args.indexOf('--expected-reviewer-public-key-sha256') + 1] = 'f'.repeat(64);
  const result = run(args);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /reviewer_public_key_fingerprint_mismatch/);
});

test('rejects malformed or missing fingerprint pins before reading evidence', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-args-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  const malformed = argsFor(bundle);
  malformed[malformed.indexOf('--expected-operator-public-key-sha256') + 1] = 'not-a-sha256';
  const bad = run(malformed);
  assert.equal(bad.status, 2);
  assert.match(JSON.parse(bad.stdout).error, /invalid_sha256_fingerprint/);
  const missing = argsFor(bundle);
  const missingIndex = missing.indexOf('--expected-reviewer-public-key-sha256');
  missing.splice(missingIndex, 2);
  const absent = run(missing);
  assert.equal(absent.status, 2);
  assert.match(JSON.parse(absent.stdout).error, /required_argument_missing/);
});

test('rejects manifest tampering even when both expected key fingerprints are correct', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-tamper-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  fs.writeFileSync(bundle.files.manifest, JSON.stringify({
    ...bundle.manifest,
    archive_sha256: digest('tampered archive')
  }));
  const result = run(argsFor(bundle));
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'NOT_VERIFIED');
});

test('rejects evidence files located inside the Git checkout', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-repo-path-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  const args = argsFor(bundle);
  args[args.indexOf('--manifest') + 1] = __filename;
  const result = run(args);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /outside_git_checkout/);
});

test('rejects an external hard-link alias to a file inside the Git checkout', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-hardlink-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const alias = path.join(directory, 'external-manifest.json');
  fs.linkSync(__filename, alias);
  assert.throws(
    () => readExternalFile(alias, 'manifest', 64 * 1024),
    /manifest_must_not_have_hard_link_aliases/
  );
});

test('help text states the independent fingerprint and non-authorization limits', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /trusted channel/);
  assert.match(result.stdout, /does not authenticate people/);
  assert.match(result.stdout, /prove a restore/);
});


test('pinned verifier rejects invalid UTF-8 manifest bytes before signature verification', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-invalid-utf8-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundle = createBundle(directory);
  fs.writeFileSync(bundle.files.manifest, Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
  const result = run(argsFor(bundle));
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error, 'manifest_is_not_valid_utf8');
});
