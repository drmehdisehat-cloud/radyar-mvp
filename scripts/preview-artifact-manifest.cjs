'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 'dadyar-preview-artifact-manifest-v1';
const MANIFEST = 'manifest.json';
const EXPECTED_TOP_LEVEL = ['dadyar-preview'];

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every(part => part && part !== '.' && part !== '..');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listPayloadFiles(root) {
  const rootReal = fs.realpathSync(root);
  const top = fs.readdirSync(rootReal, { withFileTypes: true }).map(entry => entry.name).sort();
  const actualTop = top.filter(name => name !== MANIFEST);
  if (JSON.stringify(actualTop) !== JSON.stringify(EXPECTED_TOP_LEVEL)) {
    throw new Error('Unexpected artifact top-level entries: ' + actualTop.join(', '));
  }

  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(rootReal, absolute).split(path.sep).join('/');
      if (!safeRelativePath(relative)) throw new Error('Unsafe artifact path: ' + relative);
      if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in preview artifacts: ' + relative);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.push({ path: relative, bytes: fs.statSync(absolute).size, sha256: sha256(absolute) });
      } else {
        throw new Error('Unsupported filesystem entry in preview artifact: ' + relative);
      }
    }
  }

  for (const name of EXPECTED_TOP_LEVEL) {
    const absolute = path.join(rootReal, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('Top-level symlink is not allowed: ' + name);
    if (name === 'dadyar-preview' ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error('Unexpected top-level entry type: ' + name);
    }
    if (stat.isDirectory()) walk(absolute);
    else files.push({ path: name, bytes: stat.size, sha256: sha256(absolute) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return files;
}

function createManifest(root, sourceCommit) {
  if (!/^[a-f0-9]{40}$/i.test(sourceCommit || '')) throw new Error('A full 40-character source commit SHA is required.');
  const rootReal = fs.realpathSync(root);
  const manifest = {
    schema: SCHEMA,
    sourceCommit: sourceCommit.toLowerCase(),
    hash: 'SHA-256',
    files: listPayloadFiles(rootReal)
  };
  fs.writeFileSync(path.join(rootReal, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'w' });
  return manifest;
}

function verifyManifest(root) {
  const rootReal = fs.realpathSync(root);
  const manifestPath = path.join(rootReal, MANIFEST);
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error('Artifact manifest must be a regular file.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== SCHEMA || manifest.hash !== 'SHA-256') throw new Error('Unsupported preview artifact manifest schema.');
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '')) throw new Error('Invalid source commit in preview manifest.');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Preview manifest has no payload files.');

  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || !safeRelativePath(item.path) || item.path === MANIFEST) throw new Error('Unsafe or invalid path in preview manifest.');
    if (seen.has(item.path)) throw new Error('Duplicate path in preview manifest: ' + item.path);
    seen.add(item.path);
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
      throw new Error('Invalid size or SHA-256 entry for: ' + item.path);
    }
  }

  const actual = listPayloadFiles(rootReal);
  const expectedPaths = manifest.files.map(item => item.path).sort();
  const actualPaths = actual.map(item => item.path).sort();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
    throw new Error('Artifact payload file list does not match manifest.');
  }
  const expectedByPath = new Map(manifest.files.map(item => [item.path, item]));
  for (const file of actual) {
    const expected = expectedByPath.get(file.path);
    if (file.bytes !== expected.bytes || file.sha256 !== expected.sha256) {
      throw new Error('Artifact payload integrity mismatch: ' + file.path);
    }
  }
  return { sourceCommit: manifest.sourceCommit, files: actual.length, verified: true };
}

if (require.main === module) {
  try {
    const [mode, root, commit] = process.argv.slice(2);
    if (mode === 'create' && root && commit) {
      const manifest = createManifest(root, commit);
      console.log('Created preview manifest for ' + manifest.files.length + ' files at commit ' + manifest.sourceCommit);
    } else if (mode === 'verify' && root) {
      const result = verifyManifest(root);
      console.log('Verified ' + result.files + ' preview payload files for commit ' + result.sourceCommit);
    } else {
      throw new Error('Usage: node preview-artifact-manifest.cjs create <root> <commit-sha> | verify <root>');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createManifest, verifyManifest, listPayloadFiles, safeRelativePath };
