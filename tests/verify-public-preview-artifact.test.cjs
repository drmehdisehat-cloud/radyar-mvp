'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  crc32, gitBlobSha1, sha256, verifyArtifactBuffer, verifyArtifactFile
} = require('../scripts/verify-public-preview-artifact.cjs');

const COMMIT = 'b'.repeat(40);
const TOPIC_IDS = Array.from({ length: 27 }, (_, index) => '"id":"topic-' + (index + 1) + '"').join(',');
const HTML = Buffer.from([
  '<!doctype html><html lang="fa" dir="rtl">',
  '<head><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'"></head>',
  '<body><h1>چک فرضی</h1><p>داده‌های ساختگی؛ اطلاعات واقعی وارد نکنید.</p>',
  '<p>نقش‌های وکیل، قاضی، دادستان، ضابط و سردفتر صرفاً شبیه‌سازی آموزشی‌اند.</p>',
  '<textarea id="free-question"></textarea><script>const topicHints = [',
  TOPIC_IDS, '];</script></body></html>'
].join('\n'), 'utf8');

function manifestFor(htmlBytes, overrides = {}) {
  return {
    schema: 'dadyar-public-preview-integrity-v1',
    source_commit: COMMIT,
    workflow_commit: COMMIT,
    source_branch: 'dadyar/ai-chat-private-20261101',
    source_file: 'public/index.html',
    target_subpath: '/dadyar-preview/',
    sha256: sha256(htmlBytes),
    git_blob_sha1: gitBlobSha1(htmlBytes),
    topic_hint_count: 27,
    api_enabled: false,
    public_ai_enabled: false,
    reviewer_authentication: 'not-configured',
    backup_restore_verified: false,
    destination_verified: false,
    deployment_authorized: false,
    notice: 'Integrity evidence only. Reviewer authentication is not configured; server-side adapters have only synthetic integration coverage. This manifest does not prove backup restoration, destination validity, reviewer identity, legal accuracy, or deployment authorization.',
    ...overrides
  };
}
function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8');
    const method = entry.method ?? 8;
    const flags = entry.flags ?? 0;
    const compressed = method === 0 ? content : zlib.deflateRawSync(content);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, eocd]);
}
function validEntries(overrides = {}) {
  const html = overrides.html ?? HTML;
  const manifest = overrides.manifest ?? Buffer.from(JSON.stringify(manifestFor(html)), 'utf8');
  return [
    { name: 'index.html', content: html, ...(overrides.htmlEntry || {}) },
    { name: 'INTEGRITY.json', content: manifest, ...(overrides.manifestEntry || {}) }
  ];
}

test('verifies exact public artifact files, commit, manifest digests and offline boundary', () => {
  const result = verifyArtifactBuffer(makeZip(validEntries()), COMMIT);
  assert.equal(result.verified, true);
  assert.deepEqual(result.files, ['INTEGRITY.json', 'index.html']);
  assert.equal(result.source_commit, COMMIT);
  assert.equal(result.target_subpath, '/dadyar-preview/');
  assert.equal(result.topic_hint_count, 27);
  assert.equal(result.api_enabled, false);
  assert.equal(result.public_ai_enabled, false);
  assert.equal(result.backup_restore_verified, false);
  assert.equal(result.destination_verified, false);
  assert.equal(result.deployment_authorized, false);
  assert.equal(result.deployment_authorized_by_this_tool, false);
});
test('rejects extra, duplicate and path-traversal ZIP entries', () => {
  assert.throws(() => verifyArtifactBuffer(makeZip([...validEntries(), { name: 'handoff/README.txt', content: 'private handoff' }]), COMMIT), /zip_entry_count_or_zip64_not_supported/);
  assert.throws(() => verifyArtifactBuffer(makeZip([validEntries()[0], validEntries()[0]]), COMMIT), /zip_duplicate_entry/);
  const traversal = [
    { name: '../index.html', content: HTML },
    { name: 'INTEGRITY.json', content: JSON.stringify(manifestFor(HTML)) }
  ];
  assert.throws(() => verifyArtifactBuffer(makeZip(traversal), COMMIT), /zip_unsafe_entry_path/);
});
test('rejects symlink entries, encrypted entries and unsupported compression', () => {
  assert.throws(() => verifyArtifactBuffer(makeZip([
    { name: 'index.html', content: HTML, mode: 0o120777 }, validEntries()[1]
  ]), COMMIT), /zip_non_regular_file_rejected/);
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ htmlEntry: { flags: 1 } })), COMMIT), /zip_encrypted_entry_rejected/);
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ htmlEntry: { method: 12 } })), COMMIT), /zip_compression_method_not_supported/);
});
test('rejects altered HTML, wrong source commit and release flags promoted to true', () => {
  const changedHtml = Buffer.from(HTML.toString('utf8').replace('داده‌های ساختگی', 'داده‌های آزمایشی'), 'utf8');
  const originalManifest = Buffer.from(JSON.stringify(manifestFor(HTML)), 'utf8');
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ html: changedHtml, manifest: originalManifest })), COMMIT), /manifest_html_sha256_mismatch/);
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries()), 'c'.repeat(40)), /manifest_commit_mismatch/);
  const promoted = Buffer.from(JSON.stringify(manifestFor(HTML, { deployment_authorized: true })), 'utf8');
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ manifest: promoted })), COMMIT), /manifest_release_flags_must_remain_false/);
});
test('rejects ambiguous or promoted reviewer authentication states in downloaded artifacts', () => {
  for (const value of ['not-implemented', 'verified', 'connected']) {
    const manifest = Buffer.from(JSON.stringify(manifestFor(HTML, { reviewer_authentication: value })), 'utf8');
    assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ manifest })), COMMIT), /manifest_reviewer_authentication_must_remain_unconfigured/);
  }
});
test('rejects duplicate JSON keys and a mismatched Git blob pin', () => {
  const duplicateManifest = JSON.stringify(manifestFor(HTML)).replace('"schema":', '"schema":"duplicate","schema":');
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ manifest: duplicateManifest })), COMMIT), /manifest_invalid_json:duplicate_json_key/);
  const wrongBlob = Buffer.from(JSON.stringify(manifestFor(HTML, { git_blob_sha1: '0'.repeat(40) })), 'utf8');
  assert.throws(() => verifyArtifactBuffer(makeZip(validEntries({ manifest: wrongBlob })), COMMIT), /manifest_git_blob_sha1_mismatch/);
});
test('rejects malformed ZIP bytes and tampered CRC values', () => {
  assert.throws(() => verifyArtifactBuffer(Buffer.from('not a zip'), COMMIT), /archive_size_out_of_bounds|zip_end_of_central_directory_missing/);
  const damaged = Buffer.from(makeZip(validEntries()));
  const central = damaged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  damaged.writeUInt32LE((damaged.readUInt32LE(central + 16) ^ 1) >>> 0, central + 16);
  assert.throws(() => verifyArtifactBuffer(damaged, COMMIT), /zip_local_central_size_or_crc_mismatch|zip_crc32_mismatch/);
});
test('file verifier accepts a stable standalone archive outside the checkout and rejects aliases', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-artifact-verifier-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const archivePath = path.join(root, 'preview.zip');
  fs.writeFileSync(archivePath, makeZip(validEntries()), { mode: 0o600 });
  assert.equal(verifyArtifactFile(archivePath, COMMIT).verified, true);
  const alias = path.join(root, 'alias.zip');
  fs.symlinkSync(archivePath, alias);
  assert.throws(() => verifyArtifactFile(alias, COMMIT), /archive_must_be_regular_file/);
  const hardlink = path.join(root, 'hardlink.zip');
  fs.linkSync(archivePath, hardlink);
  assert.throws(() => verifyArtifactFile(hardlink, COMMIT), /archive_hard_link_alias_rejected/);
});
