'use strict';
// Synthetic fixtures only. C1 controls (U+0080..U+009F) must not enter
// Persian legal narratives, browser exports, or local API validation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateCase } = require('../backend/validation');
const { createServer } = require('../backend/server');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('const UNSAFE_TEXT =');
const end = source.indexOf('function show(', start);
assert.ok(start >= 0 && end > start, 'browser validator must be present');
const safeCaseText = vm.runInNewContext(
  source.slice(start, end) + '\nsafeCaseText', Object.create(null), { timeout: 500 });
const base = {
  topic: 'theft', role: 'شاهد', story: 'شرح کاملاً ساختگی برای آزمون کنترل نویسه',
  answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم']
};

test('all 32 C1 control code points rejected by browser and server', () => {
  for (let cp = 0x80; cp <= 0x9f; cp++) {
    const bad = 'شرح ساختگی ' + String.fromCharCode(cp) + ' ادامه';
    assert.equal(safeCaseText(bad, 10, 5000), false, 'browser story U+' + cp.toString(16));
    assert.equal(safeCaseText(bad, 1, 2000), false, 'browser answer U+' + cp.toString(16));
    assert.deepEqual(validateCase({ ...base, story: bad }).errors, ['story'], 'server story U+' + cp.toString(16));
    assert.deepEqual(validateCase({ ...base, answers: [bad, ...base.answers.slice(1)] }).errors,
      ['answers'], 'server answer U+' + cp.toString(16));
  }
  const valid = 'متن ساختگی با نیم\u200cفاصله و\nخط بعد';
  assert.equal(safeCaseText(valid, 10, 5000), true);
  assert.equal(validateCase({ ...base, story: valid }).valid, true);
});

test('loopback HTTP API rejects a C1 control without echoing case text', async () => {
  const server = createServer({ rateLimit: { max: 10, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/cases/validate';
    const marker = 'SYNTHETIC_CASE_MARKER';
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...base, story: base.story + '\u0085' + marker }),
      signal: AbortSignal.timeout(4000)
    });
    assert.equal(res.status, 422);
    const body = await res.text();
    assert.deepEqual(JSON.parse(body), { valid: false, errors: ['story'] });
    assert.equal(body.includes(marker), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
