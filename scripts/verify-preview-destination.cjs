'use strict';
// Offline preview integrity preflight. This is NOT proof of backup restorability.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function verifyPreview(source, destination) {
  const src = fs.realpathSync(source);
  const dst = fs.realpathSync(destination);
  assert.ok(fs.statSync(src).isFile(), 'source must be a regular file');
  assert.ok(fs.statSync(dst).isFile(), 'destination must be a regular file');
  assert.equal(path.basename(src), 'index.html', 'source must be index.html');
  assert.equal(path.basename(dst), 'index.html', 'destination must be index.html');
  const sourceHash = sha256(src);
  const destinationHash = sha256(dst);
  assert.equal(destinationHash, sourceHash, 'destination differs from reviewed source');
  const html = fs.readFileSync(dst, 'utf8');
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /id="export-ack"/);
  assert.match(html, /id="download" disabled/);
  return { source_sha256: sourceHash, destination_sha256: destinationHash, matched: true };
}
if (require.main === module) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) {
    console.error('Usage: node scripts/verify-preview-destination.cjs SOURCE/index.html DESTINATION/index.html');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(verifyPreview(source, destination))); }
    catch (error) { console.error('NOT_VERIFIED:', error.message); process.exitCode = 1; }
  }
}
module.exports = { verifyPreview };
