'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readEvidence } = require('../scripts/preview-release-preflight.cjs');
const { readStableRegularFile } = require('../scripts/stable-file-integrity.cjs');

function fixture(t, prefix = 'dadyar-preflight-evidence-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'evidence.json');
  fs.writeFileSync(file, JSON.stringify({ status: 'NOT_READY', synthetic: true }));
  return { directory, file };
}

test('reads a stable external JSON evidence object', t => {
  const f = fixture(t);
  assert.deepEqual(readEvidence('--restore-evidence', f.file), {
    status: 'NOT_READY',
    synthetic: true
  });
});

test('rejects symlinked evidence paths', t => {
  const f = fixture(t);
  const alias = path.join(f.directory, 'evidence-link.json');
  fs.symlinkSync(f.file, alias);
  assert.throws(() => readEvidence('--restore-evidence', alias), /evidence_path_contains_symlink/);
});

test('rejects hard-linked evidence aliases', t => {
  const f = fixture(t);
  const alias = path.join(f.directory, 'evidence-hardlink.json');
  fs.linkSync(f.file, alias);
  assert.throws(() => readEvidence('--restore-evidence', alias), /must not have hard-link aliases/);
});

test('rejects empty evidence before JSON parsing', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '');
  assert.throws(() => readEvidence('--restore-evidence', f.file), /must not be empty/);
});

test('rejects evidence above the 64 KiB budget before reading its bytes', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, Buffer.alloc(64 * 1024 + 1, 0x20));
  assert.throws(() => readEvidence('--restore-evidence', f.file), /exceeds maximum size/);
});

test('rejects directories as evidence files', t => {
  const f = fixture(t);
  assert.throws(() => readEvidence('--restore-evidence', f.directory), /must be a regular file/);
});

test('rejects evidence stored inside the Git checkout', () => {
  assert.throws(() => readEvidence('--restore-evidence', __filename), /must be outside git checkout/);
});

test('stable reader rejects invalid and exceeded byte limits', t => {
  const f = fixture(t);
  assert.throws(() => readStableRegularFile(f.file, 'fixture', { maxBytes: 0 }), /maxBytes must be a positive safe integer/);
  assert.throws(() => readStableRegularFile(f.file, 'fixture', { maxBytes: 4 }), /exceeds maximum size/);
});
