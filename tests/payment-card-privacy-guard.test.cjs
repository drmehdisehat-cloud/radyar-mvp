'use strict';
// Synthetic-only privacy regression. Card-like numbers must not be accepted
// in the local interview or reflected by the development API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateCase } = require('../backend/validation');
const { createServer } = require('../backend/server');

const client = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = client.indexOf('const UNSAFE_TEXT =');
const end = client.indexOf('function show(', start);
assert.ok(start >= 0 && end > start);
const safeCaseText = vm.runInNewContext(
  client.slice(start, end) + '\nsafeCaseText', Object.create(null), { timeout: 500 }
);
const sample = {
  topic: 'fraud', role: 'شاهد',
  story: 'شرح کاملاً ساختگی برای آزمون عدم افشای شماره کارت',
  answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم'],
};
const fixtures = [
  ['ASCII continuous', 'شرح ساختگی 4111111111111111', false],
  ['ASCII grouped', 'شرح ساختگی 4111-1111-1111-1111', false],
  ['Persian grouped', 'شرح ساختگی ۴۱۱۱ ۱۱۱۱ ۱۱۱۱ ۱۱۱۱', false],
  ['Arabic grouped', 'شرح ساختگی ٤١١١ ١١١١ ١١١١ ١١١١', false],
  ['Persian NBSP grouped', 'شرح ساختگی ۴۱۱۱\u00A0۱۱۱۱\u00A0۱۱۱۱\u00A0۱۱۱۱', false],
  ['ASCII narrow NBSP grouped', 'شرح ساختگی 4111\u202F1111\u202F1111\u202F1111', false],
  ['ASCII thin-space grouped', 'شرح ساختگی 4111\u20091111\u20091111\u20091111', false],
  ['ASCII tab grouped', 'شرح ساختگی 4111\t1111\t1111\t1111', false],
  ['ASCII en-dash grouped', 'شرح ساختگی 4111\u20131111\u20131111\u20131111', false],
  ['ASCII double-space grouped', 'شرح ساختگی 4111  1111  1111  1111', false],
  ['mixed separators', 'شرح ساختگی 4111 \u2013 1111\u00A01111\t1111', false],
  ['twenty digits grouped is not a sixteen-digit card', 'شرح ساختگی 1234 4111 1111 1111 1111', true],
  ['wrong Luhn checksum', 'شرح ساختگی 4111111111111112', true],
  ['fifteen digits', 'شرح ساختگی 411111111111111', true],
  ['ordinary year and date', 'تاریخ ساختگی ۱۴۰۵/۰۷/۰۱', true],
];
test('browser and server reject likely complete card numbers consistently', () => {
  for (const [label, value, expected] of fixtures) {
    assert.equal(safeCaseText(value, 10, 5000), expected, label + ' browser');
    assert.equal(!validateCase({ ...sample, story: value }).errors.includes('story'), expected,
      label + ' server story');
    assert.equal(!validateCase({ ...sample, answers: [value, '۲', '۳', '۴', '۵'] }).errors.includes('answers'),
      expected, label + ' server answer');
  }
});
test('loopback API rejects a synthetic card-like number without echoing it', async () => {
  const server = createServer({ rateLimit: { max: 20, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/cases/validate';
    const post = payload => fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(4000),
    });
    const card = '4111111111111111'; // public synthetic test value, never client data
    const denied = await post({ ...sample, story: sample.story + ' ' + card });
    assert.equal(denied.status, 422);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
    const body = await denied.text();
    assert.deepEqual(JSON.parse(body), { valid: false, errors: ['story'] });
    assert.equal(body.includes(card), false);
    const accepted = await post({ ...sample, story: sample.story + ' ۱۴۰۵/۰۷/۰۱' });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { valid: true, errors: [] });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
