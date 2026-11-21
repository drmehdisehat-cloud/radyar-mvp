'use strict';
// Static UI wiring contract for the development-only, opt-in validation API.
// Uses synthetic data only; no browser requests or client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
  assert.match(client, /redirect: 'error'/, 'Validation must refuse HTTP redirects');
  assert.match(client, /fetch\('\/api\/cases\/validate',/, 'Validation must use a relative local path');
});

test('missing validation control and unsafe CSP fail closed', () => {
  assert.throws(() => verifyUi(html.replace('id="validateLocal"', 'id="missingControl"')));
  assert.throws(() => verifyUi(html.replace("connect-src 'self'", "connect-src 'none'")));
  assert.throws(() => verifyUi(html.replace('<script src="api-validation.js"></script>', '')));
});

test('opt-in local API refuses redirects and reports validation failure', async () => {
  // Synthetic-only DOM/fetch harness. No real network or client information.
  const listeners = new Map();
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      disabled: true, textContent: '',
      addEventListener(event, callback) { listeners.set(id + ':' + event, callback); }
    });
    return nodes.get(id);
  };
  let requests = 0;
  const context = {
    document: { getElementById: element },
    window: { addEventListener() {} },
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    state: {
      topic: 'theft', role: 'شاهد',
      story: 'شرح کاملاً ساختگی برای آزمون جلوگیری از تغییر مسیر',
      answers: Array(5).fill('پاسخ ساختگی')
    },
    questionsFor: () => Array(5).fill('سؤال ساختگی'),
    confirm: () => true,
    AbortController, setTimeout, clearTimeout,
    async fetch(url, options) {
      requests++;
      assert.equal(url, '/api/cases/validate');
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      // Simulate browser redirect behavior: with "error", the browser
      // rejects a redirect instead of forwarding the case body.
      if (options.redirect !== 'error') {
        return { ok: true, json: async () => ({ valid: true }) };
      }
      throw new TypeError('Synthetic redirect blocked');
    }
  };
  vm.runInNewContext(client, context, { timeout: 1000 });
  assert.equal(element('validateLocal').disabled, false);
  await listeners.get('validateLocal:click')();
  assert.equal(requests, 1);
  assert.match(element('validationStatus').textContent, /اتصال به API محلی ناموفق بود/);
  assert.equal(element('validateLocal').disabled, false);
});
