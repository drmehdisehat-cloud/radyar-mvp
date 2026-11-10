'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha1');
  digest.update(`blob ${bytes.length}\0`);
  digest.update(bytes);
  return digest.digest('hex');
}
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

test('destination verifier accepts exact synthetic offline preview copy and rejects tampering', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-destination-'));
  try {
    const productionRoot = path.join(dir, 'production-root');
    fs.mkdirSync(productionRoot);
    const source = path.resolve(__dirname, '../dadyar-preview/index.html');
    const expectedSourceBlobSha = gitBlobSha(source);
    assert.throws(() => verifyPreview(source, source, productionRoot, expectedSourceBlobSha), /distinct staged file/);
    const alias = path.join(dir, 'alias.html');
    fs.symlinkSync(source, alias);
    assert.throws(() => verifyPreview(source, alias, productionRoot, expectedSourceBlobSha), /destination must not be a symbolic link/);
    const linkedDir = path.join(dir, 'linked');
    fs.mkdirSync(linkedDir);
    fs.symlinkSync(source, path.join(linkedDir, 'index.html'));
    assert.throws(() => verifyPreview(source, path.join(linkedDir, 'index.html'), productionRoot, expectedSourceBlobSha), /destination must not be a symbolic link/);
    const hardLinkDir = path.join(dir, 'hard-linked');
    fs.mkdirSync(hardLinkDir);
    const hardLink = path.join(hardLinkDir, 'index.html');
    fs.linkSync(source, hardLink);
    assert.throws(() => verifyPreview(source, hardLink, productionRoot, expectedSourceBlobSha), /hard link to source/);
    const destination = path.join(dir, 'index.html');
    fs.copyFileSync(source, destination);
    assert.throws(() => verifyPreview(source, destination, productionRoot), /expected reviewed source Git blob SHA-1 required/);
    assert.throws(() => verifyPreview(source, destination, productionRoot, '0'.repeat(40)), /source differs from pinned reviewed Git blob/);
    const separateLink = path.join(dir, 'symlinked', 'index.html');
    fs.mkdirSync(path.dirname(separateLink));
    fs.symlinkSync(destination, separateLink);
    assert.throws(() => verifyPreview(source, separateLink, productionRoot, expectedSourceBlobSha), /destination must not be a symbolic link/);
    const result = verifyPreview(source, destination, productionRoot, expectedSourceBlobSha);
    assert.equal(result.matched, true);
    assert.equal(result.source_blob_sha1, expectedSourceBlobSha);
    assert.match(result.source_sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.source_sha256, result.destination_sha256);
    assert.equal(result.destination_outside_document_root, true);
    const liveDestination = path.join(productionRoot, 'dadyar-preview');
    fs.mkdirSync(liveDestination);
    const liveIndex = path.join(liveDestination, 'index.html');
    fs.copyFileSync(source, liveIndex);
    assert.throws(() => verifyPreview(source, liveIndex, productionRoot, expectedSourceBlobSha), /outside production document root/);
    fs.appendFileSync(destination, '\n<!-- tampered -->');
    assert.throws(() => verifyPreview(source, destination, productionRoot, expectedSourceBlobSha), /destination differs/);
    fs.copyFileSync(source, destination);
    fs.writeFileSync(destination, fs.readFileSync(destination, 'utf8').replace("connect-src 'none'", "connect-src *"));
    assert.throws(() => verifyPreview(source, destination, productionRoot, expectedSourceBlobSha), /destination differs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
