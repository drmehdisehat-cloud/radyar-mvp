'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

test('destination verifier accepts exact synthetic offline preview copy and rejects tampering', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-destination-'));
  try {
    const source = path.resolve(__dirname, '../dadyar-preview/index.html');
    assert.throws(() => verifyPreview(source, source), /distinct deployed file/);
    const alias = path.join(dir, 'alias.html');
    fs.symlinkSync(source, alias);
    assert.throws(() => verifyPreview(source, alias), /distinct deployed file/);
    const linkedDir = path.join(dir, 'linked');
    fs.mkdirSync(linkedDir);
    fs.symlinkSync(source, path.join(linkedDir, 'index.html'));
    assert.throws(() => verifyPreview(source, path.join(linkedDir, 'index.html')), /distinct deployed file/);
    const destination = path.join(dir, 'index.html');
    fs.copyFileSync(source, destination);
    const separateLink = path.join(dir, 'symlinked', 'index.html');
    fs.mkdirSync(path.dirname(separateLink));
    fs.symlinkSync(destination, separateLink);
    assert.throws(() => verifyPreview(source, separateLink), /destination must not be a symbolic link/);
    const result = verifyPreview(source, destination);
    assert.equal(result.matched, true);
    assert.match(result.source_sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.source_sha256, result.destination_sha256);
    fs.appendFileSync(destination, '\n<!-- tampered -->');
    assert.throws(() => verifyPreview(source, destination), /destination differs/);
    fs.copyFileSync(source, destination);
    fs.writeFileSync(destination, fs.readFileSync(destination, 'utf8').replace("connect-src 'none'", "connect-src *"));
    assert.throws(() => verifyPreview(source, destination), /destination differs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
