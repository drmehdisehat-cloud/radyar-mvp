'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createFileNonceStore } = require('../backend/file-nonce-store.cjs');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dadyar-nonce-store-'));
  const publicRoot = path.join(root, 'public');
  const privateRoot = path.join(root, 'private');
  await fs.mkdir(publicRoot, { mode: 0o755 });
  await fs.mkdir(privateRoot, { mode: 0o700 });
  return {
    root,
    publicRoot,
    privateRoot,
    async cleanup() { await fs.rm(root, { recursive: true, force: true }); }
  };
}

function nonce() {
  return crypto.randomBytes(16).toString('base64url');
}

test('consumes a nonce once and persists replay protection across store instances', async () => {
  const f = await fixture();
  try {
    const value = nonce();
    const expiry = Date.now() + 60_000;
    const first = await createFileNonceStore({ directory: f.privateRoot, publicRoot: f.publicRoot });
    assert.equal(await first.consume(value, expiry), true);

    const second = await createFileNonceStore({ directory: f.privateRoot, publicRoot: f.publicRoot });
    assert.equal(await second.consume(value, expiry), false);
  } finally {
    await f.cleanup();
  }
});

test('allows exactly one winner for concurrent attempts with the same nonce', async () => {
  const f = await fixture();
  try {
    const store = await createFileNonceStore({ directory: f.privateRoot, publicRoot: f.publicRoot });
    const value = nonce();
    const outcomes = await Promise.all(
      Array.from({ length: 24 }, () => store.consume(value, Date.now() + 60_000))
    );
    assert.equal(outcomes.filter(Boolean).length, 1);
    assert.equal(outcomes.filter(result => result === false).length, 23);
  } finally {
    await f.cleanup();
  }
});

test('rejects nonce storage inside the public web root before creating it', async () => {
  const f = await fixture();
  try {
    const inside = path.join(f.publicRoot, 'private-nonces');
    await assert.rejects(
      createFileNonceStore({ directory: inside, publicRoot: f.publicRoot }),
      /outside the public web root/
    );
    await assert.rejects(fs.lstat(inside), { code: 'ENOENT' });
  } finally {
    await f.cleanup();
  }
});

test('rejects symlinked and group/world-accessible nonce directories', async () => {
  const f = await fixture();
  try {
    const real = path.join(f.root, 'real-private');
    const linked = path.join(f.root, 'linked-private');
    const broad = path.join(f.root, 'broad-private');
    await fs.mkdir(real, { mode: 0o700 });
    await fs.symlink(real, linked);
    await fs.mkdir(broad, { mode: 0o755 });

    await assert.rejects(
      createFileNonceStore({ directory: linked, publicRoot: f.publicRoot }),
      /symlink/
    );
    await assert.rejects(
      createFileNonceStore({ directory: broad, publicRoot: f.publicRoot }),
      /permissions/
    );
  } finally {
    await f.cleanup();
  }
});

test('rejects malformed nonces and expired or unsafe expiry values', async () => {
  const f = await fixture();
  try {
    const store = await createFileNonceStore({ directory: f.privateRoot, publicRoot: f.publicRoot });
    await assert.rejects(store.consume('not-a-nonce', Date.now() + 60_000), /canonical base64url/);
    await assert.rejects(store.consume(nonce(), Date.now() - 1), /future Unix timestamp/);
    await assert.rejects(store.consume(nonce(), Number.MAX_SAFE_INTEGER + 1), /future Unix timestamp/);
  } finally {
    await f.cleanup();
  }
});

test('rejects symlinked ancestor directories before creating nonce storage', async () => {
  const f = await fixture();
  try {
    const realParent = path.join(f.root, 'real-parent');
    const linkedParent = path.join(f.root, 'linked-parent');
    await fs.mkdir(realParent, { mode: 0o700 });
    await fs.symlink(realParent, linkedParent, 'dir');
    const requested = path.join(linkedParent, 'nested', 'private-nonces');
    await assert.rejects(
      createFileNonceStore({ directory: requested, publicRoot: f.publicRoot }),
      /Nonce storage path must not contain symlinks/
    );
    await assert.rejects(fs.lstat(path.join(realParent, 'nested')), { code: 'ENOENT' });
  } finally {
    await f.cleanup();
  }
});
