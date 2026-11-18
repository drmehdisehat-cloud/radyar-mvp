'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { canonicalizePayload } = require('../scripts/verify-human-review-attestation.cjs');
const { canonicalizeManifest } = require('../scripts/verify-restore-attestation-signatures.cjs');

const CLI = path.join(__dirname, '../scripts/preview-release-preflight.cjs');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update('blob ' + bytes.length + String.fromCharCode(0));
  hash.update(bytes);
  return hash.digest('hex');
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-release-preflight-'));
  const restoreCompleted = new Date(Date.now() - 120000).toISOString();
  const reviewed = new Date(Date.now() - 60000).toISOString();
  const restoreRoot = path.join(directory, 'isolated-restore');
  const productionRoot = path.join(directory, 'production', 'public_html');
  fs.mkdirSync(restoreRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(productionRoot, { recursive: true, mode: 0o700 });

  const restoreBytes = {
    archive: Buffer.from('synthetic archive'),
    marker: Buffer.from('synthetic marker'),
    log: Buffer.from('synthetic restore log; exit=0'),
    databaseProbe: Buffer.from('{"synthetic":true,"database_probe_passed":true}')
  };
  const restoreArchiveFile = path.join(directory, 'archive.evidence');
  const restoredMarkerFile = path.join(restoreRoot, 'index.html');
  const restoreLogFile = path.join(directory, 'restore.log');
  const databaseProbeFile = path.join(directory, 'database-probe.json');
  fs.writeFileSync(restoreArchiveFile, restoreBytes.archive, { mode: 0o600 });
  fs.writeFileSync(restoredMarkerFile, restoreBytes.marker, { mode: 0o600 });
  fs.writeFileSync(restoreLogFile, restoreBytes.log, { mode: 0o600 });
  fs.writeFileSync(databaseProbeFile, restoreBytes.databaseProbe, { mode: 0o600 });

  const restore = {
    evidence: 'independent-restore-manifest-v1',
    restore_proven: true,
    backup_provider: 'iranhost',
    source_site_origin: 'https://mehdisehat.ir',
    backup_id: 'synthetic-iranhost-backup-001',
    backup_created_at: new Date(Date.now() - 240000).toISOString(),
    archive_size_bytes: restoreBytes.archive.length,
    archive_sha256: digest(restoreBytes.archive),
    restored_marker_sha256: digest(restoreBytes.marker),
    restore_log_sha256: digest(restoreBytes.log),
    database_probe_sha256: digest(restoreBytes.databaseProbe),
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'synthetic-isolated-target',
    restore_target_path: fs.realpathSync(restoreRoot),
    restore_target_realpath: fs.realpathSync(restoreRoot),
    production_document_root: fs.realpathSync(productionRoot),
    production_document_root_realpath: fs.realpathSync(productionRoot),
    restore_database_name: 'synthetic_staging_db',
    production_database_name: 'synthetic_production_db',
    restore_database_user: 'synthetic_staging_user',
    production_database_user: 'synthetic_production_user',
    restore_operator: 'Synthetic Operator',
    independent_reviewer: 'Synthetic Reviewer',
    restore_completed_at: restoreCompleted,
    reviewed_at: reviewed
  };

  const sourcePreview = path.join(path.resolve(__dirname, '..'), 'dadyar-preview', 'index.html');
  const sourceBytes = fs.readFileSync(sourcePreview);
  const sourceHash = digest(sourceBytes);
  const sourceCommit = 'c'.repeat(40);
  const sourceBlobSha = gitBlobSha1(sourceBytes);
  const stagingDirectory = path.join(directory, 'isolated-staging', 'dadyar-preview');
  fs.mkdirSync(stagingDirectory, { recursive: true, mode: 0o700 });
  const previewDestination = path.join(stagingDirectory, 'index.html');
  fs.writeFileSync(previewDestination, sourceBytes, { mode: 0o600 });
  const destination = require('../scripts/verify-preview-destination.cjs').verifyPreview(
    sourcePreview, previewDestination, productionRoot, sourceBlobSha
  );

  const operatorKeys = crypto.generateKeyPairSync('ed25519');
  const reviewerKeys = crypto.generateKeyPairSync('ed25519');
  const canonicalRestore = Buffer.from(canonicalizeManifest(restore), 'utf8');
  const operatorSignature = crypto.sign(null, canonicalRestore, operatorKeys.privateKey);
  const reviewerSignature = crypto.sign(null, canonicalRestore, reviewerKeys.privateKey);
  const operatorPublicKeyPem = operatorKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const reviewerPublicKeyPem = reviewerKeys.publicKey.export({ type: 'spki', format: 'pem' });
  const operatorFingerprint = digest(operatorKeys.publicKey.export({ type: 'spki', format: 'der' }));
  const reviewerFingerprint = digest(reviewerKeys.publicKey.export({ type: 'spki', format: 'der' }));

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const payload = {
    schema: 'dadyar-human-review-attestation-v2',
    issuer: 'synthetic-owner-review-registry',
    subject: 'synthetic-reviewer-01',
    audience: 'dadyar-preview-release',
    decision: 'approved',
    review_id: crypto.randomUUID(),
    source_commit: sourceCommit,
    source_blob_sha1: sourceBlobSha,
    artifact_sha256: sourceHash,
    reviewed_at: reviewed,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(32).toString('base64url')
  };
  const attestation = {
    payload,
    signature: crypto.sign(null, Buffer.from(canonicalizePayload(payload)), privateKey).toString('base64url')
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

  const restoreFile = path.join(directory, 'restore.json');
  const destinationFile = path.join(directory, 'destination.json');
  const attestationFile = path.join(directory, 'review-attestation.json');
  const trustStoreFile = path.join(directory, 'review-trust-store.json');
  const restoreOperatorPublicKeyFile = path.join(directory, 'restore-operator-public.pem');
  const restoreOperatorSignatureFile = path.join(directory, 'restore-operator.sig');
  const restoreReviewerPublicKeyFile = path.join(directory, 'restore-reviewer-public.pem');
  const restoreReviewerSignatureFile = path.join(directory, 'restore-reviewer.sig');
  fs.writeFileSync(restoreFile, JSON.stringify(restore), { mode: 0o600 });
  fs.writeFileSync(destinationFile, JSON.stringify(destination), { mode: 0o600 });
  fs.writeFileSync(attestationFile, JSON.stringify(attestation), { mode: 0o600 });
  fs.writeFileSync(trustStoreFile, JSON.stringify(trustStore), { mode: 0o600 });
  fs.writeFileSync(restoreOperatorPublicKeyFile, operatorPublicKeyPem, { mode: 0o600 });
  fs.writeFileSync(restoreOperatorSignatureFile, operatorSignature, { mode: 0o600 });
  fs.writeFileSync(restoreReviewerPublicKeyFile, reviewerPublicKeyPem, { mode: 0o600 });
  fs.writeFileSync(restoreReviewerSignatureFile, reviewerSignature, { mode: 0o600 });
  return {
    directory, restoreFile, destinationFile, attestationFile, trustStoreFile,
    restoreArchiveFile, restoredMarkerFile, restoreLogFile, databaseProbeFile,
    sourcePreview, previewDestination, productionRoot, sourceBlobSha,
    restoreOperatorPublicKeyFile, restoreOperatorSignatureFile,
    restoreReviewerPublicKeyFile, restoreReviewerSignatureFile,
    operatorFingerprint, reviewerFingerprint, sourceCommit, sourceHash
  };
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 5000 });
}

function baseArgs(f) {
  return [
    '--restore-evidence', f.restoreFile,
    '--restore-archive', f.restoreArchiveFile,
    '--restore-marker', f.restoredMarkerFile,
    '--restore-log', f.restoreLogFile,
    '--restore-database-probe', f.databaseProbeFile,
    '--restore-operator-public-key', f.restoreOperatorPublicKeyFile,
    '--restore-operator-signature', f.restoreOperatorSignatureFile,
    '--restore-reviewer-public-key', f.restoreReviewerPublicKeyFile,
    '--restore-reviewer-signature', f.restoreReviewerSignatureFile,
    '--expected-restore-operator-public-key-sha256', f.operatorFingerprint,
    '--expected-restore-reviewer-public-key-sha256', f.reviewerFingerprint,
    '--destination-evidence', f.destinationFile,
    '--preview-source', f.sourcePreview,
    '--preview-destination', f.previewDestination,
    '--production-document-root', f.productionRoot,
    '--expected-source-blob-sha1', f.sourceBlobSha,
    '--review-attestation', f.attestationFile,
    '--review-trust-store', f.trustStoreFile,
    '--expected-source-commit', f.sourceCommit,
    '--expected-artifact-sha256', f.sourceHash,
    '--expected-review-trust-store-sha256', digest(fs.readFileSync(f.trustStoreFile)),
    '--isolated-restore-verified',
    '--mobile-browser-verified',
    '--zero-api-requests-verified',
    '--local-human-review-acknowledged'
  ];
}

function removeValuePair(args, flag) {
  const copy = [...args];
  const index = copy.indexOf(flag);
  if (index >= 0) copy.splice(index, 2);
  return copy;
}

test('read-only CLI verifies a signed synthetic review but remains NOT_READY without the trusted auth adapter', () => {
  const f = fixture();
  try {
    const result = run(baseArgs(f));
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.equal(report.deploymentAuthorized, false);
    assert.equal(report.externalChecksPending.length, 5);
    assert.ok(report.blockers.includes('trusted reviewer authentication adapter is not integrated and verified'));
    assert.equal(report.evidenceFilesRead, true);
    assert.equal(report.attestationFlagsSupplied, 4);
    assert.equal(report.restoreAttestation.verified, true);
    assert.equal(report.restoreAttestation.keyFingerprintsPinned, true);
    assert.equal(report.restoreAttestation.signerIdentityIndependentlyVerified, false);
    assert.equal(report.restoreAttestation.restoreOperationIndependentlyVerified, false);
    assert.equal(report.restoreEvidenceBundle.matched, true);
    assert.equal(report.restoreEvidenceBundle.status, 'EVIDENCE_BYTES_MATCH_MANIFEST_NOT_RESTORE_PROOF');
    assert.deepEqual(Object.keys(report.restoreEvidenceBundle.files).sort(), ['archive', 'database_probe', 'restore_log', 'restored_marker']);
    assert.equal(report.destinationVerification.matched, true);
    assert.equal(report.destinationVerification.destination_realpath, f.previewDestination);
    assert.equal(report.reviewAttestation.verified, true);
    assert.equal(report.reviewAttestation.subject, 'synthetic-reviewer-01');
    assert.equal(report.reviewAttestation.trustStoreSha256, digest(fs.readFileSync(f.trustStoreFile)));
    assert.equal(report.deploymentPerformed, false);
    assert.match(report.note, /امضای دوطرفه اظهارنامه بازیابی/);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('all four restore evidence files are hashed against the signed manifest', () => {
  for (const [field, pathKey, expectedError] of [
    ['archive', 'restoreArchiveFile', 'archive_sha256_mismatch'],
    ['restored marker', 'restoredMarkerFile', 'restored_marker_sha256_mismatch'],
    ['restore log', 'restoreLogFile', 'restore_log_sha256_mismatch'],
    ['database probe', 'databaseProbeFile', 'database_probe_sha256_mismatch']
  ]) {
    const f = fixture();
    try {
      fs.appendFileSync(f[pathKey], Buffer.from('tampered'));
      const result = run(baseArgs(f));
      assert.equal(result.status, 2, field + ': ' + result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.status, 'NOT_READY');
      assert.ok(report.blockers.includes(expectedError));
      assert.equal(report.deploymentPerformed, false);
    } finally {
      fs.rmSync(f.directory, { recursive: true, force: true });
    }
  }
});

test('missing one restore evidence file path blocks the preflight', () => {
  const f = fixture();
  try {
    const result = run(removeValuePair(baseArgs(f), '--restore-database-probe'));
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.ok(report.blockers.includes('restore_evidence_bundle_files_required'));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('a missing owner-pinned trust-store digest cannot authenticate a reviewer', () => {
  const f = fixture();
  try {
    const args = removeValuePair(baseArgs(f), '--expected-review-trust-store-sha256');
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reviewAttestation.verified, false);
    assert.equal(report.reviewAttestation.reason, 'review_trust_store_digest_required');
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('a substituted trust store is rejected when its bytes differ from the owner-pinned digest', () => {
  const f = fixture();
  try {
    const args = baseArgs(f);
    const trustStore = JSON.parse(fs.readFileSync(f.trustStoreFile, 'utf8'));
    trustStore.issuer = 'substituted-trust-store';
    fs.writeFileSync(f.trustStoreFile, JSON.stringify(trustStore));
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reviewAttestation.verified, false);
    assert.equal(report.reviewAttestation.reason, 'review_trust_store_digest_mismatch');
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('malformed and all-zero trust-store digests are rejected', () => {
  const f = fixture();
  try {
    for (const invalidDigest of ['not-a-sha256', '0'.repeat(64)]) {
      const args = baseArgs(f);
      const index = args.indexOf('--expected-review-trust-store-sha256') + 1;
      args[index] = invalidDigest;
      const result = run(args);
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.reviewAttestation.reason, 'invalid_expected_review_trust_store_sha256');
      assert.equal(report.deploymentPerformed, false);
    }
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('local review approval alone cannot satisfy the authenticated-review release gate', () => {
  const f = fixture();
  try {
    let args = baseArgs(f);
    for (const flag of ['--review-attestation', '--review-trust-store',
      '--expected-source-commit', '--expected-artifact-sha256']) {
      args = removeValuePair(args, flag);
    }
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.includes('authenticated human reviewer attestation missing'));
    assert.equal(report.reviewAttestation.verified, false);
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('tampered review payload fails signature verification', () => {
  const f = fixture();
  try {
    const value = JSON.parse(fs.readFileSync(f.attestationFile, 'utf8'));
    value.payload.review_id = crypto.randomUUID();
    fs.writeFileSync(f.attestationFile, JSON.stringify(value));
    const result = run(baseArgs(f));
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reviewAttestation.verified, false);
    assert.equal(report.reviewAttestation.reason, 'invalid_signature');
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('review signature must be bound to the exact artifact and source commit', () => {
  const f = fixture();
  try {
    const args = baseArgs(f);
    const commitIndex = args.indexOf('--expected-source-commit') + 1;
    args[commitIndex] = 'd'.repeat(40);
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reviewAttestation.reason, 'review_target_mismatch');
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('the preflight re-hashes the actual staged destination instead of trusting JSON claims', () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.previewDestination, Buffer.from('tampered staged preview'), { mode: 0o600 });
    const result = run(baseArgs(f));
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.some(item => /destination differs from reviewed source/.test(item)));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('legacy boolean authentication flag is rejected instead of being trusted', () => {
  const f = fixture();
  try {
    const result = run([...baseArgs(f), '--authenticated-human-review-attested']);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.match(report.blockers.join(' '), /unknown_argument/);
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('trust-store issuer mismatch cannot authenticate a signed reviewer', () => {
  const f = fixture();
  try {
    const trustStore = JSON.parse(fs.readFileSync(f.trustStoreFile, 'utf8'));
    trustStore.issuer = 'untrusted-issuer';
    fs.writeFileSync(f.trustStoreFile, JSON.stringify(trustStore));
    const result = run(baseArgs(f));
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.reviewAttestation.verified, false);
    assert.equal(report.reviewAttestation.reason, 'issuer_mismatch');
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('missing mobile or zero-network attestation fails closed and never deploys', () => {
  const f = fixture();
  try {
    const args = baseArgs(f).filter(arg => arg !== '--zero-api-requests-verified');
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.some(item => /zero API requests/i.test(item)));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('evidence files inside the Git checkout are rejected before parsing', () => {
  const f = fixture();
  try {
    const result = run([
      '--restore-evidence', __filename,
      '--destination-evidence', f.destinationFile,
      '--isolated-restore-verified',
      '--mobile-browser-verified',
      '--zero-api-requests-verified',
      '--local-human-review-acknowledged'
    ]);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.match(report.blockers.join(' '), /outside_git_checkout/);
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('symlinked evidence paths are rejected', () => {
  const f = fixture();
  const alias = path.join(f.directory, 'restore-alias.json');
  try {
    fs.symlinkSync(f.restoreFile, alias);
    const result = run([
      '--restore-evidence', alias,
      '--destination-evidence', f.destinationFile,
      '--isolated-restore-verified',
      '--mobile-browser-verified',
      '--zero-api-requests-verified',
      '--local-human-review-acknowledged'
    ]);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.match(report.blockers.join(' '), /symlink/);
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('unknown deploy-like options are rejected and the CLI exposes no deploy command', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /read-only/);
  assert.match(help.stdout, /never deploys/);
  assert.match(help.stdout, /--review-attestation/);
  assert.match(help.stdout, /--restore-archive/);
  assert.match(help.stdout, /--preview-destination/);
  assert.match(help.stdout, /--restore-operator-public-key/);
  assert.match(help.stdout, /--expected-restore-reviewer-public-key-sha256/);
  const result = run(['--deploy']);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'NOT_READY');
  assert.match(report.blockers.join(' '), /unknown_argument/);
  assert.equal(report.deploymentPerformed, false);
});



test('read-only preflight rejects legacy destination evidence without checkout separation', () => {
  const f = fixture();
  try {
    const destination = JSON.parse(fs.readFileSync(f.destinationFile, 'utf8'));
    delete destination.destination_outside_git_checkout;
    delete destination.git_checkout_realpath;
    fs.writeFileSync(f.destinationFile, JSON.stringify(destination));
    const result = run(baseArgs(f));
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.some(item => /^destination_evidence_mismatch:/.test(item)));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('malformed UTF-8 evidence is rejected before JSON parsing', () => {
  const f = fixture();
  try {
    // This is valid JSON after lossy UTF-8 replacement, but it is not valid UTF-8.
    fs.writeFileSync(f.restoreFile, Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]));
    const result = run(baseArgs(f));
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.includes('--restore-evidence_is_not_valid_utf8'));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('a modified restore manifest is rejected by the two-party signature gate', () => {
  const f = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(f.restoreFile, 'utf8'));
    manifest.restore_target_id = 'substituted-target';
    fs.writeFileSync(f.restoreFile, JSON.stringify(manifest));
    const result = run(baseArgs(f));
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.restoreAttestation.verified, false);
    assert.equal(report.restoreAttestation.reason, 'operator_signature_invalid');
    assert.ok(report.blockers.includes('two-party restore signatures and independently pinned key fingerprints missing'));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('an operator key that does not match the owner-pinned fingerprint is rejected', () => {
  const f = fixture();
  try {
    const args = baseArgs(f);
    args[args.indexOf('--expected-restore-operator-public-key-sha256') + 1] = '0'.repeat(64);
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.restoreAttestation.verified, false);
    assert.equal(report.restoreAttestation.reason, 'operator_public_key_fingerprint_mismatch');
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('missing one restore signature input blocks preflight even when the manifest looks complete', () => {
  const f = fixture();
  try {
    const args = removeValuePair(baseArgs(f), '--restore-reviewer-signature');
    const result = run(args);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.restoreAttestation.verified, false);
    assert.equal(report.restoreAttestation.reason, 'restore_attestation_inputs_incomplete');
    assert.ok(report.blockers.includes('two-party restore signatures and independently pinned key fingerprints missing'));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});

test('operator restore checklist documents only supported signed preflight options', () => {
  const guide = fs.readFileSync(path.join(__dirname, '../docs/preview-isolated-restore-operator-checklist.md'), 'utf8');
  const start = guide.indexOf('node scripts/preview-release-preflight.cjs');
  const end = guide.indexOf('\n```', start);
  assert.ok(start >= 0 && end > start, 'preflight command example must be present');
  const command = guide.slice(start, end);
  assert.doesNotMatch(command, /--authenticated-human-review-attested/);
  const flags = [...command.matchAll(/--[a-z][a-z0-9-]+/g)].map(match => match[0]);
  assert.deepEqual(new Set(flags), new Set([
    '--restore-evidence',
    '--restore-archive',
    '--restore-marker',
    '--restore-log',
    '--restore-database-probe',
    '--destination-evidence',
    '--preview-source',
    '--preview-destination',
    '--production-document-root',
    '--expected-source-blob-sha1',
    '--review-attestation',
    '--review-trust-store',
    '--expected-source-commit',
    '--expected-artifact-sha256',
    '--expected-review-trust-store-sha256',
    '--restore-operator-public-key',
    '--restore-operator-signature',
    '--restore-reviewer-public-key',
    '--restore-reviewer-signature',
    '--expected-restore-operator-public-key-sha256',
    '--expected-restore-reviewer-public-key-sha256',
    '--isolated-restore-verified',
    '--mobile-browser-verified',
    '--zero-api-requests-verified',
    '--local-human-review-acknowledged'
  ]));
});


test('ambiguous human-review-verified flag is rejected instead of being treated as authenticated review', () => {
  const f = fixture();
  try {
    const args = baseArgs(f).filter(argument => argument !== '--local-human-review-acknowledged');
    const result = run([...args, '--human-review-verified']);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.ok(report.blockers.some(item => /unknown_argument/.test(item)));
    assert.equal(report.deploymentPerformed, false);
  } finally {
    fs.rmSync(f.directory, { recursive: true, force: true });
  }
});
