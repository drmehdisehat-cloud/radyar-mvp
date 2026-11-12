'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildOfflinePreviewPackage } = require('../scripts/build-offline-preview-package.cjs');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'dadyar-preview', 'index.html');
const commit = 'e1210a4059cb29f7775afe63c6a3e59db9ede01d';
const branch = 'dadyar/ai-chat-private-20261101';
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function withTemp(t, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-preview-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return callback(root);
}

test('handoff package is minimal, byte-identical, checksum verified and explicitly non-deployable', t => {
  withTemp(t, root => {
    const destination = path.join(root, 'bundle');
    const result = buildOfflinePreviewPackage(destination, { repoRoot, sourcePath, commit, branch });
    assert.equal(result.checksums_verified, true);
    assert.equal(result.release_authorized, false);
    assert.equal(result.api_enabled, false);
    assert.equal(result.source_commit, commit);
    assert.deepEqual(fs.readdirSync(destination).sort(),
      ['PREVIEW-METADATA.json', 'README-fa.txt', 'SHA256SUMS', 'index.html']);
    assert.deepEqual(fs.readFileSync(path.join(destination, 'index.html')), fs.readFileSync(sourcePath));

    const metadata = JSON.parse(fs.readFileSync(path.join(destination, 'PREVIEW-METADATA.json'), 'utf8'));
    assert.equal(metadata.source_commit, commit);
    assert.equal(metadata.source_branch, branch);
    assert.equal(metadata.target_subpath, '/dadyar-preview/');
    assert.equal(metadata.api_enabled, false);
    assert.equal(metadata.public_ai_enabled, false);
    assert.equal(metadata.reviewer_authentication, 'not-implemented');
    assert.equal(metadata.backup_restore_verified, false);
    assert.equal(metadata.destination_verified, false);
    assert.equal(metadata.deployment_authorized, false);

    const readme = fs.readFileSync(path.join(destination, 'README-fa.txt'), 'utf8');
    assert.match(readme, /بازیابی بکاپ در محیط مستقل/);
    assert.match(readme, /هویت بازبین احراز نمی‌شود/);
    assert.match(readme, /مجوز استقرار نیست/);

    const manifest = fs.readFileSync(path.join(destination, 'SHA256SUMS'), 'utf8').trim().split('\n');
    assert.equal(manifest.length, 3);
    for (const row of manifest) {
      const match = row.match(/^([a-f0-9]{64})  (.+)$/);
      assert.ok(match, 'manifest row must use sha256sum format');
      assert.equal(hash(fs.readFileSync(path.join(destination, match[2]))), match[1]);
    }
  });
});

test('builder refuses to overwrite an existing destination', t => {
  withTemp(t, root => {
    const destination = path.join(root, 'existing');
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'keep.txt'), 'keep');
    assert.throws(() => buildOfflinePreviewPackage(destination, { repoRoot, sourcePath, commit, branch }), /already exists/);
    assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'keep');
  });
});

test('builder refuses a destination inside the repository', () => {
  const destination = path.join(repoRoot, '.preview-package-test-must-not-exist');
  assert.throws(() => buildOfflinePreviewPackage(destination, { repoRoot, sourcePath, commit, branch }),
    /outside the repository/);
  assert.equal(fs.existsSync(destination), false);
});

test('builder requires a full immutable source commit SHA', t => {
  withTemp(t, root => {
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, { repoRoot, sourcePath, branch, commit: 'main' }),
      /full 40-character source commit SHA/);
    assert.equal(fs.existsSync(destination), false);
  });
});

test('builder refuses any branch other than the named experimental branch', t => {
  withTemp(t, root => {
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, { repoRoot, sourcePath, commit, branch: 'main' }),
      /restricted to the approved experimental branch/);
    assert.equal(fs.existsSync(destination), false);
  });
});

test('builder refuses a symlinked preview source', t => {
  withTemp(t, root => {
    const fakeRoot = path.join(root, 'repo');
    const previewDir = path.join(fakeRoot, 'dadyar-preview');
    fs.mkdirSync(previewDir, { recursive: true });
    const symlinkSource = path.join(previewDir, 'index.html');
    fs.symlinkSync(sourcePath, symlinkSource);
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, {
      repoRoot: fakeRoot, sourcePath: symlinkSource, commit, branch
    }), /regular, non-symlink file/);
    assert.equal(fs.existsSync(destination), false);
  });
});

test('builder rejects a source with a remote dependency or network-capable API', t => {
  withTemp(t, root => {
    const fakeRoot = path.join(root, 'repo');
    const previewDir = path.join(fakeRoot, 'dadyar-preview');
    fs.mkdirSync(previewDir, { recursive: true });
    const unsafeSource = path.join(previewDir, 'index.html');
    const unsafeHtml = fs.readFileSync(sourcePath, 'utf8') + '\n<script>fetch("/api")</script>';
    fs.writeFileSync(unsafeSource, unsafeHtml);
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, {
      repoRoot: fakeRoot, sourcePath: unsafeSource, commit, branch
    }), /network-capable browser APIs/);
    assert.equal(fs.existsSync(destination), false);
  });
});

test('builder rejects a symlinked source ancestor even when its target remains inside the checkout', t => {
  withTemp(t, root => {
    const fakeRoot = path.join(root, 'repo');
    const realPreview = path.join(fakeRoot, 'real-preview');
    const aliasPreview = path.join(fakeRoot, 'alias-preview');
    fs.mkdirSync(realPreview, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(realPreview, 'index.html'));
    fs.symlinkSync(realPreview, aliasPreview, 'dir');
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, {
      repoRoot: fakeRoot,
      sourcePath: path.join(aliasPreview, 'index.html'),
      commit,
      branch
    }), /path changed before read/);
    assert.equal(fs.existsSync(destination), false);
  });
});

test('builder rejects a hard-linked preview source', t => {
  withTemp(t, root => {
    const fakeRoot = path.join(root, 'repo');
    const previewDir = path.join(fakeRoot, 'dadyar-preview');
    fs.mkdirSync(previewDir, { recursive: true });
    const source = path.join(previewDir, 'index.html');
    const alias = path.join(previewDir, 'alias.html');
    fs.copyFileSync(sourcePath, source);
    fs.linkSync(source, alias);
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, {
      repoRoot: fakeRoot, sourcePath: source, commit, branch
    }), /must not have hard-link aliases/);
    assert.equal(fs.existsSync(destination), false);
  });
});

test('builder rejects an oversized preview source before creating the package', t => {
  withTemp(t, root => {
    const fakeRoot = path.join(root, 'repo');
    const previewDir = path.join(fakeRoot, 'dadyar-preview');
    fs.mkdirSync(previewDir, { recursive: true });
    const source = path.join(previewDir, 'index.html');
    fs.writeFileSync(source, Buffer.concat([
      fs.readFileSync(sourcePath),
      Buffer.from('<!--'),
      Buffer.alloc(1024 * 1024, 0x61),
      Buffer.from('-->')
    ]));
    const destination = path.join(root, 'bundle');
    assert.throws(() => buildOfflinePreviewPackage(destination, {
      repoRoot: fakeRoot, sourcePath: source, commit, branch
    }), /exceeds maximum size/);
    assert.equal(fs.existsSync(destination), false);
  });
});
