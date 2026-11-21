'use strict';
// Synthetic-only regression: a local validation POST must not follow redirects.
// A redirect could forward confidential interview text to another origin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('opt-in browser validation refuses redirects and does not echo case data', async () => {
  const handlers = new Map();
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        disabled: false, textContent: '',
        addEventListener(event, callback) { handlers.set(id + ':' + event, callback); },
      });
    }
    return elements.get(id);
  }
  const marker = 'SYNTHETIC_REDIRECT_MARKER_NOT_A_CLIENT';
  const interview = {
    topic: 'fraud', role: 'شاهد', story: 'شرح کاملاً ساختگی ' + marker,
    answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم'],
  };
  const requests = [];
  const sandbox = {
    document: { getElementById: element },
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    window: { addEventListener() {} },
    state: interview,
    questionsFor: () => [1, 2, 3, 4, 5],
    confirm: () => true,
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, options });
      // A browser with redirect:'error' rejects a redirected fetch.
      throw new TypeError('redirect blocked');
    },
  };
  const script = fs.readFileSync(path.join(__dirname, '../api-validation.js'), 'utf8');
  vm.runInNewContext(script, sandbox, { timeout: 1000 });
  const click = handlers.get('validateLocal:click');
  assert.equal(typeof click, 'function');
  await click();
  assert.equal(requests.length, 1, 'one consented request; no retry');
  const { url, options } = requests[0];
  assert.equal(url, '/api/cases/validate');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error', 'never follow a redirect with interview data');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(JSON.parse(options.body).story, interview.story);
  assert.equal(elements.get('validateLocal').disabled, false);
  assert.match(elements.get('validationStatus').textContent, /اتصال .* ناموفق بود/);
  assert.doesNotMatch(elements.get('validationStatus').textContent, /SYNTHETIC_REDIRECT_MARKER/);
});
