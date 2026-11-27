'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { verifyEvidence, publicKeyFingerprint } = require('../scripts/verify-preview-staging-evidence.cjs');
const { signPayload, readPrivateKeyFile } = require('../scripts/sign-preview-staging-evidence.cjs');
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function makeZip(entries, options = {}) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.bytes);
    const compressed = zlib.deflateRawSync(content);
    const checksum = crc32(content);
    const descriptor = options.dataDescriptor === true;
    const flags = 0x0800 | (descriptor ? 0x0008 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(descriptor ? 0 : checksum, 14);
    local.writeUInt32LE(descriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(descriptor ? 0 : content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    let record = Buffer.concat([local, name, compressed]);
    if (descriptor) {
      const dataDescriptor = Buffer.alloc(16);
      dataDescriptor.writeUInt32LE(0x08074b50, 0);
      dataDescriptor.writeUInt32LE(checksum, 4);
      dataDescriptor.writeUInt32LE(compressed.length, 8);
      dataDescriptor.writeUInt32LE(content.length, 12);
      record = Buffer.concat([record, dataDescriptor]);
    }
    localRecords.push(record);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((((entry.mode || 0o100644) & 0xffff) * 0x10000) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([central, name]));
    localOffset += record.length;
  }
  const centralBytes = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localRecords, centralBytes, end]);
}

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
  fs.writeFileSync(artifactPath, makeZip([
    { name: 'index.html', bytes: fs.readFileSync(htmlPath) },
    { name: 'INTEGRITY.json', bytes: fs.readFileSync(integrityPath) }
  ], { dataDescriptor: true }));
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
  assert.equal(result.previewArtifactMembersVerified, true);
  assert.equal(result.sourceCommit, 'a'.repeat(40));
  assert.deepEqual(result.destinationFiles, ['INTEGRITY.json', 'index.html']);
  assert.notEqual(result.operatorFingerprint, result.reviewerFingerprint);
});

test('preview artifact ZIP members must be byte-identical to the isolated destination', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const result = await verifyEvidence(f.evidence, f.options);
  assert.equal(result.previewArtifactMembersVerified, true);
  assert.equal(result.destinationSha256['index.html'], hash(fs.readFileSync(f.htmlPath)));
});
test('preview artifact ZIP with different HTML is rejected even when its archive hash is signed', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const alteredHtml = Buffer.from(fs.readFileSync(f.htmlPath).toString('utf8') + '<!-- different package -->');
  const zip = makeZip([
    { name: 'index.html', bytes: alteredHtml },
    { name: 'INTEGRITY.json', bytes: fs.readFileSync(path.join(f.destination, 'INTEGRITY.json')) }
  ]);
  fs.writeFileSync(f.artifactPath, zip);
  f.payload.previewArtifact.sha256 = hash(zip);
  f.resign();
  await assert.rejects(
    () => verifyEvidence(f.evidence, f.options),
    /preview_artifact_member_sha256_mismatch:index\.html/
  );
});
test('preview artifact ZIP rejects an unexpected member', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const zip = makeZip([
    { name: 'index.html', bytes: fs.readFileSync(f.htmlPath) },
    { name: 'INTEGRITY.json', bytes: fs.readFileSync(path.join(f.destination, 'INTEGRITY.json')) },
    { name: 'notes.txt', bytes: Buffer.from('synthetic') }
  ]);
  fs.writeFileSync(f.artifactPath, zip);
  f.payload.previewArtifact.sha256 = hash(zip);
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /preview_artifact_member_set_mismatch/);
});
test('preview artifact ZIP rejects a symlink member', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const zip = makeZip([
    { name: 'index.html', bytes: fs.readFileSync(f.htmlPath), mode: 0o120777 },
    { name: 'INTEGRITY.json', bytes: fs.readFileSync(path.join(f.destination, 'INTEGRITY.json')) }
  ]);
  fs.writeFileSync(f.artifactPath, zip);
  f.payload.previewArtifact.sha256 = hash(zip);
  f.resign();
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /preview_artifact_member_not_regular_file/);
});

test('database probe before restore completion is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.databaseProbe.testedAt = '2026-11-26T08:59:59Z';
  f.resign();
  await assert.rejects(
    () => verifyEvidence(f.evidence, f.options),
    /database_probe_must_follow_restore_completion/
  );
});
test('database probe at the same instant as restore completion is rejected', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.databaseProbe.testedAt = f.payload.backup.restoreCompletedAt;
  f.resign();
  await assert.rejects(
    () => verifyEvidence(f.evidence, f.options),
    /database_probe_must_follow_restore_completion/
  );
});
test('invalid attestation is rejected before any evidence-supplied path is opened', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  f.payload.backup.archivePath = path.join(f.root, 'missing-backup.tar');
  await assert.rejects(
    () => verifyEvidence(f.evidence, f.options),
    /operator_signature_invalid/
  );
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
test('hard-linked backup archive is rejected before hashing', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const external = path.join(f.root, 'external-backup');
  fs.copyFileSync(f.backupPath, external);
  fs.unlinkSync(f.backupPath);
  fs.linkSync(external, f.backupPath);
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /backup_archive_hardlink_forbidden/);
});

test('hard-linked preview artifact is rejected before hashing', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const external = path.join(f.root, 'external-preview');
  fs.copyFileSync(f.artifactPath, external);
  fs.unlinkSync(f.artifactPath);
  fs.linkSync(external, f.artifactPath);
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /preview_artifact_hardlink_forbidden/);
});

test('reviewer public key is opened without following a symlink', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const link = path.join(f.root, 'reviewer-link.pub.pem');
  fs.symlinkSync(f.reviewerPublicPath, link);
  f.options.reviewerPublicKeyPath = link;
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /reviewer_key_symlink_forbidden/);
});

test('hard-linked restore sentinel is rejected even when its bytes match', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  const external = path.join(f.root, 'external-sentinel');
  fs.copyFileSync(f.sentinelPath, external);
  fs.unlinkSync(f.sentinelPath);
  fs.linkSync(external, f.sentinelPath);
  await assert.rejects(() => verifyEvidence(f.evidence, f.options), /restore_sentinel_hardlink_forbidden/);
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
  const updatedArtifact = makeZip([
    { name: 'index.html', bytes: fs.readFileSync(f.htmlPath) },
    { name: 'INTEGRITY.json', bytes: fs.readFileSync(integrityPath) }
  ]);
  fs.writeFileSync(f.artifactPath, updatedArtifact);
  f.payload.previewArtifact.sha256 = hash(updatedArtifact);
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
  const updatedArtifact = makeZip([
    { name: 'index.html', bytes: fs.readFileSync(f.htmlPath) },
    { name: 'INTEGRITY.json', bytes: fs.readFileSync(integrityPath) }
  ]);
  fs.writeFileSync(f.artifactPath, updatedArtifact);
  f.payload.previewArtifact.sha256 = hash(updatedArtifact);
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


test('IranHost Complete label and backup size metadata cannot substitute for isolated restore evidence', async t => {
  const f = makeFixture(); t.after(f.cleanup);
  // Provider-side status and byte count are metadata only. They must not be
  // accepted as proof in the signed evidence payload or bypass restore checks.
  f.payload.backup.status = 'Complete';
  f.payload.backup.sizeBytes = 140.38 * 1024 * 1024;
  f.resign();
  await assert.rejects(
    () => verifyEvidence(f.evidence, f.options),
    /backup_fields_mismatch/
  );
});
