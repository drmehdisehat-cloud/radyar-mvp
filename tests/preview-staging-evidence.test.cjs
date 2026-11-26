'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyEvidence, publicKeyFingerprint } = require('../scripts/verify-preview-staging-evidence.cjs');
const { signPayload, readPrivateKeyFile } = require('../scripts/sign-preview-staging-evidence.cjs');
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-restore-evidence-'));
  const production = path.join(root, 'production');
  const repository = path.join(root, 'repository');
  const staging = path.join(root, 'staging');
  const restore = path.join(staging, 'restore');
  const destination = path.join(staging, 'public', 'dadyar-preview');
  const backupDirectory = path.join(root, 'backup');
  for (const directory of [production, repository, restore, destination, backupDirectory]) fs.mkdirSync(directory, { recursive: true });
  const backupPath = path.join(backupDirectory, 'synthetic-backup.tar');
  const sentinelPath = path.join(restore, '.dadyar-restore-proof');
  const artifactPath = path.join(backupDirectory, 'synthetic-preview.zip');
  const htmlPath = path.join(destination, 'index.html');
  const integrityPath = path.join(destination, 'INTEGRITY.json');
  const sourceCommit = 'a'.repeat(40);
  const html = '<!doctype html><html lang="fa" dir="rtl"><title>synthetic</title></html>\n';
  fs.writeFileSync(backupPath, 'synthetic backup archive bytes');
  fs.writeFileSync(sentinelPath, 'restored into isolated staging only\n');
  fs.writeFileSync(artifactPath, 'synthetic preview artifact bytes');
  fs.writeFileSync(htmlPath, html);
  const integrity = {
    schemaVersion: 1,
    artifactType: 'dadyar-public-preview-review-only',
    sourceCommit,
    workflowCommit: sourceCommit,
    route: '/dadyar-preview/',
    files: ['index.html', 'INTEGRITY.json'],
    htmlSha256: hash(Buffer.from(html)),
    release: {
      status: 'NOT_READY',
      apiEnabled: false,
      publicAiEnabled: false,
      reviewerAuthentication: 'not-configured',
      backupRestoreVerified: false,
      destinationVerified: false,
      deploymentAuthorized: false
    }
  };
  fs.writeFileSync(integrityPath, JSON.stringify(integrity, null, 2) + '\n');
  const operator = crypto.generateKeyPairSync('ed25519');
  const reviewer = crypto.generateKeyPairSync('ed25519');
  const operatorPrivate = operator.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const reviewerPrivate = reviewer.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const operatorPublicPath = path.join(root, 'operator.pub.pem');
  const reviewerPublicPath = path.join(root, 'reviewer.pub.pem');
  fs.writeFileSync(operatorPublicPath, operator.publicKey.export({ type: 'spki', format: 'pem' }));
  fs.writeFileSync(reviewerPublicPath, reviewer.publicKey.export({ type: 'spki', format: 'pem' }));
  const payload = {
    schemaVersion: 1,
    sourceCommit,
    environment: { kind: 'isolated-staging', stagingRoot: staging, productionDocumentRoot: production, repositoryRoot: repository },
    backup: {
      archivePath: backupPath,
      sha256: hash(fs.readFileSync(backupPath)),
      restoreRoot: restore,
      sentinelPath,
      sentinelSha256: hash(fs.readFileSync(sentinelPath)),
      restoreExitCode: 0,
      restoreCompletedAt: '2026-11-26T09:00:00Z'
    },
    previewArtifact: { archivePath: artifactPath, sha256: hash(fs.readFileSync(artifactPath)) },
    databaseProbe: {
      success: true, query: 'SELECT 1', value: 1,
      stagingFingerprint: 'b'.repeat(64), productionFingerprint: 'c'.repeat(64),
      testedAt: '2026-11-26T09:05:00Z'
    },
    destination: {
      directoryPath: destination,
      files: [
        { name: 'index.html', sha256: hash(fs.readFileSync(htmlPath)) },
        { name: 'INTEGRITY.json', sha256: hash(fs.readFileSync(integrityPath)) }
      ]
    }
  };
  const evidence = { payload, attestations: {} };
  function resign() {
    evidence.attestations.operator = signPayload(payload, operatorPrivate);
    evidence.attestations.reviewer = signPayload(payload, reviewerPrivate);
  }
  resign();
  const options = {
    operatorPublicKeyPath: operatorPublicPath,
    operatorFingerprint: publicKeyFingerprint(operator.publicKey),
    reviewerPublicKeyPath: reviewerPublicPath,
    reviewerFingerprint: publicKeyFingerprint(reviewer.publicKey)
  };
  return {
    root, production, repository, staging, restore, destination, backupPath, sentinelPath, artifactPath, htmlPath,
    operatorPrivate, operatorPublicPath, reviewerPublicPath, payload, evidence, options, resign,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}
test('signed restore and staging evidence passes only for isolated, hash-matched preview files', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const result = await verifyEvidence(f.evidence, f.options);
  assert.equal(result.status, 'EVIDENCE_MATCHED_NOT_RELEASE_AUTHORIZED');
  assert.equal(result.keyFingerprintsPinned, true);
  assert.equal(result.signerIdentityIndependentlyVerified, false);
  assert.equal(result.restoreOperationIndependentlyVerified, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.sourceCommit, 'a'.repeat(40));
  assert.deepEqual(result.destinationFiles, ['INTEGRITY.json', 'index.html']);
  assert.notEqual(result.operatorFingerprint, result.reviewerFingerprint);
});
test('tampered backup archive is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  fs.appendFileSync(f.backupPath, 'tamper');
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /backup_archive_sha256_mismatch/);
});
test('tampered destination file is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  fs.appendFileSync(f.htmlPath, 'tamper');
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /destination_file_sha256_mismatch:index\.html/);
});
test('staging root overlapping production is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.environment.productionDocumentRoot = path.join(f.staging, 'public');
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /staging_root_overlaps_production_document_root/);
});
test('a staging database fingerprint equal to production is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.databaseProbe.stagingFingerprint = f.payload.databaseProbe.productionFingerprint;
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /staging_database_matches_production/);
});
test('restore tree outside the isolated staging root is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.backup.restoreRoot = f.production;
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /restore_root_outside_staging/);
});
test('symlinked destination file is rejected even when its target hash matches', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const external = path.join(f.root, 'external-index.html');
  fs.copyFileSync(f.htmlPath, external);
  fs.unlinkSync(f.htmlPath);
  fs.symlinkSync(external, f.htmlPath);
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /symlink_forbidden/);
});
test('hard-linked destination file is rejected even when its bytes match', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const protectedFile = path.join(f.production, 'index.html');
  fs.copyFileSync(f.htmlPath, protectedFile);
  fs.unlinkSync(f.htmlPath);
  fs.linkSync(protectedFile, f.htmlPath);
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /destination_file_hardlink_forbidden:index\.html/);
});
test('operator and reviewer must use distinct trusted Ed25519 keys', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.evidence.attestations.reviewer = signPayload(f.payload, f.operatorPrivate);
  f.options.reviewerPublicKeyPath = f.operatorPublicPath;
  f.options.reviewerFingerprint = f.options.operatorFingerprint;
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /operator_and_reviewer_must_be_distinct/);
});
test('signature tampering is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.evidence.attestations.reviewer.signatureBase64 = Buffer.alloc(64, 7).toString('base64');
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /reviewer_signature_invalid/);
});
test('untrusted public-key fingerprint is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.options.reviewerFingerprint = 'd'.repeat(64);
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /reviewer_trusted_key_fingerprint_mismatch/);
});
test('secret-bearing evidence fields are rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.apiKey = 'synthetic-secret-placeholder';
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /sensitive_field_forbidden/);
});
test('unknown evidence fields are rejected before any attestation is trusted', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.operatorNote = 'synthetic-only';
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /payload_fields_mismatch/);
});
test('pull_request merge-SHA artifact is not eligible for staging', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const integrityPath = path.join(f.destination, 'INTEGRITY.json');
  const manifest = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  manifest.workflowCommit = 'b'.repeat(40);
  fs.writeFileSync(integrityPath, JSON.stringify(manifest, null, 2) + '\n');
  f.payload.destination.files.find(item => item.name === 'INTEGRITY.json').sha256 = hash(fs.readFileSync(integrityPath));
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /destination_manifest_source_commit_mismatch/);
});
test('review artifact cannot claim deployment readiness', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const integrityPath = path.join(f.destination, 'INTEGRITY.json');
  const manifest = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  manifest.release.deploymentAuthorized = true;
  fs.writeFileSync(integrityPath, JSON.stringify(manifest, null, 2) + '\n');
  f.payload.destination.files.find(item => item.name === 'INTEGRITY.json').sha256 = hash(fs.readFileSync(integrityPath));
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /review_artifact_release_boundary_invalid/);
});


test('IranHost restore handoff confirms the account panel and archive format before any restore command', () => {
  const runbook = fs.readFileSync(path.join(__dirname, '..', 'docs', 'preview-staging-restore-runbook.md'), 'utf8');
  const start = runbook.indexOf('## تأیید نوع پنل و قالب بکاپ پیش از هر دستور');
  assert.ok(start >= 0, 'restore runbook must contain a panel/archive preflight section');
  const section = runbook.slice(start).split(/\n## /, 1)[0];
  for (const required of [
    'cPanel',
    'SolidCP',
    'قالبی',
    'ابزار و نسخه',
    'Restore درجا',
    'Sandbox مستقل',
    'نشست تعاملی',
    'OTP',
    'کلید API'
  ]) {
    assert.ok(section.includes(required), 'restore preflight must explicitly cover: ' + required);
  }
  assert.match(section, /Complete/);
  assert.match(section, /۱۴۰٫۳۸ مگابایت/);
});


test('artifact readback record binds the exact push artifact and preserves every release blocker', () => {
  const record = fs.readFileSync(path.join(__dirname, '..', 'docs', 'preview-artifact-readback-15137958832-20261126.md'), 'utf8');
  for (const required of [
    '15137958832',
    '45861616298',
    '45861624092',
    '5513fca9d35e0b712e2a6bdfb3072501c0f89fd7',
    '03cefd03bc962e8e42f1e283112e8228ee80dd285e6774be0b332242281becbe',
    '2bcd63edbeb1490032b92aacd384b28537e6eef33d90f882b3068b1f65bcc1c1',
    'NOT_READY',
    'backupRestoreVerified = false',
    'destinationVerified = false',
    'deploymentAuthorized = false'
  ]) {
    assert.ok(record.includes(required), 'artifact readback must preserve: ' + required);
  }
  assert.match(record, /رویداد ساخت: `push`/);
  assert.match(record, /رویداد `pull_request` عمداً Skip شدند/);
  assert.match(record, /با هر Commit جدید، Artifact جدید باید جداگانه ساخته و اعتبارسنجی شود/);
});


test('preview evidence signer accepts a private key file restricted to its owner', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-signing-key-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pair = crypto.generateKeyPairSync('ed25519');
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const keyPath = path.join(root, 'reviewer.pem');
  fs.writeFileSync(keyPath, pem, { mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  assert.equal(readPrivateKeyFile(keyPath).toString(), pem);
  assert.equal(typeof signPayload({ schemaVersion: 1 }, readPrivateKeyFile(keyPath)).signatureBase64, 'string');
});

test('preview evidence signer rejects a symlinked private key path', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-signing-key-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pair = crypto.generateKeyPairSync('ed25519');
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const target = path.join(root, 'target.pem');
  const link = path.join(root, 'link.pem');
  fs.writeFileSync(target, pem, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  fs.symlinkSync(target, link);
  assert.throws(() => readPrivateKeyFile(link), /private_key_symlink_forbidden/);
});

test('preview evidence signer rejects group-readable or world-readable private keys', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-signing-key-mode-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pair = crypto.generateKeyPairSync('ed25519');
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const keyPath = path.join(root, 'too-open.pem');
  fs.writeFileSync(keyPath, pem, { mode: 0o644 });
  fs.chmodSync(keyPath, 0o644);
  assert.throws(() => readPrivateKeyFile(keyPath), /private_key_file_permissions_too_open/);
});
