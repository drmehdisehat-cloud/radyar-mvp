'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readStableRegularFile } = require('../scripts/stable-file-integrity.cjs');

function fixture(t, prefix = 'dadyar-stable-file-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('stable reader hashes a regular file through a descriptor and returns requested bytes', t => {
  const dir = fixture(t);
  const file = path.join(dir, 'evidence.bin');
  const bytes = Buffer.from('synthetic restore evidence');
  fs.writeFileSync(file, bytes);
  const result = readStableRegularFile(file, 'evidence', { includeBytes: true });
  assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.stat.nlink, 1n);
});
test('stable reader rejects a symbolic-link leaf', t => {
  const dir = fixture(t);
  const target = path.join(dir, 'target.bin');
  const link = path.join(dir, 'link.bin');
  fs.writeFileSync(target, 'synthetic');
  fs.symlinkSync(target, link);
  assert.throws(() => readStableRegularFile(link, 'evidence'), /ELOOP|symbolic link|changed/);
});
test('stable reader rejects a file with an external hard-link alias', t => {
  const dir = fixture(t);
  const file = path.join(dir, 'evidence.bin');
  const alias = path.join(dir, 'outside-alias.bin');
  fs.writeFileSync(file, 'synthetic');
  fs.linkSync(file, alias);
  assert.throws(() => readStableRegularFile(file, 'evidence'), /hard-link aliases/);
});
test('stable reader rejects directories and other non-regular paths', t => {
  const dir = fixture(t);
  assert.throws(() => readStableRegularFile(dir, 'evidence'), /regular file/);
});
test('stable reader rejects paths reached through a symlinked parent', t => {
  const dir = fixture(t);
  const real = path.join(dir, 'real');
  const alias = path.join(dir, 'alias');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'evidence.bin'), 'synthetic');
  fs.symlinkSync(real, alias, 'dir');
  assert.throws(() => readStableRegularFile(path.join(alias, 'evidence.bin'), 'evidence'), /canonical|changed/);
});
