'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

test('preview destination rejects symlinked parent even with matching independent bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-parent-link-'));
  try {
    const source = path.resolve(__dirname, '../dadyar-preview/index.html');
    const realDir = path.join(root, 'actual-preview');
    fs.mkdirSync(realDir);
    const realDestination = path.join(realDir, 'index.html');
    fs.copyFileSync(source, realDestination);
    assert.equal(verifyPreview(source, realDestination).matched, true);
    const aliasDir = path.join(root, 'dadyar-preview');
    fs.symlinkSync(realDir, aliasDir, 'dir');
    assert.throws(
      () => verifyPreview(source, path.join(aliasDir, 'index.html')),
      /destination parent must not be a symbolic link/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
