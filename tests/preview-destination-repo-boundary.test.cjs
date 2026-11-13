'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPreview } = require('../scripts/verify-preview-destination.cjs');

function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.from(`blob ${bytes.length}`, 'utf8'));
  hash.update(Buffer.from([0]));
  hash.update(bytes);
  return hash.digest('hex');
}

test('destination verifier rejects a staging copy that remains inside the Git checkout', t => {
  const checkout = path.resolve(__dirname, '..');
  const source = path.join(checkout, 'dadyar-preview', 'index.html');
  const inCheckout = fs.mkdtempSync(path.join(checkout, '.dadyar-destination-inside-checkout-'));
  const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-production-root-'));
  t.after(() => fs.rmSync(inCheckout, { recursive: true, force: true }));
  t.after(() => fs.rmSync(productionRoot, { recursive: true, force: true }));

  const destination = path.join(inCheckout, 'index.html');
  fs.copyFileSync(source, destination);
  assert.throws(
    () => verifyPreview(source, destination, productionRoot, gitBlobSha(source)),
    /destination must be outside Git checkout/
  );
});
