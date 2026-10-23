'use strict';
// Static UI wiring contract for the development-only, opt-in validation API.
// Uses synthetic data only; no browser requests or client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'api-validation.js'), 'utf8');

function verifyUi(source) {
  for (const id of ['validateLocal', 'validationStatus']) {
    assert.equal((source.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1,
      `Expected exactly one #${id}`);
  }
  assert.match(source, /<button[^>]*id="validateLocal"[^>]*disabled[^>]*>/,
    'Validation control must start disabled');
  assert.match(source, /id="validationStatus"[^>]*aria-live="polite"/,
    'Validation feedback must be accessible');
  assert.match(source, /connect-src 'self'/,
    'Local same-origin API must be allowed by CSP');
  const scripts = ['flows.js', 'app.js', 'export.js', 'api-validation.js'];
  const offsets = scripts.map(name => source.indexOf(`<script src="${name}"></script>`));
  assert.ok(offsets.every(offset => offset >= 0), 'All scripts must be included');
  assert.ok(offsets.every((offset, i) => i === 0 || offset > offsets[i - 1]),
    'Validation client must load after app state and flows');
}

test('local opt-in UI is wired once and in safe script order', () => {
  verifyUi(html);
  assert.match(client, /location\.protocol === 'http:'/);
  assert.match(client, /\['127\.0\.0\.1', 'localhost', '\[::1\]'\]\.includes\(location\.hostname\)/);
  assert.match(client, /if \(!confirm\(/, 'Explicit confirmation required');
  assert.match(client, /credentials: 'omit'/);
  assert.match(client, /cache: 'no-store'/);
});

test('missing validation control and unsafe CSP fail closed', () => {
  assert.throws(() => verifyUi(html.replace('id="validateLocal"', 'id="missingControl"')));
  assert.throws(() => verifyUi(html.replace("connect-src 'self'", "connect-src 'none'")));
  assert.throws(() => verifyUi(html.replace('<script src="api-validation.js"></script>', '')));
});
