'use strict';
// Live loopback-only HTTP regression with synthetic Persian fixtures; no real cases.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

const sample = Object.freeze({
  topic: 'fraud', role: 'شاهد',
  story: 'شرح کاملاً ساختگی برای آزمون امنیت ارتباط محلی',
  answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم'],
});

test('HTTP boundary: strict JSON, Unicode, static assets, and origin', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, headers = {}) => fetch(base + '/api/cases/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  try {
    const valid = await post({ ...sample, story: 'شرح ساختگی با نیم\u200cفاصله و شکلک 😀' });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { valid: true, errors: [] });
    for (const bad of ['\u202e', '\u200b', '\ud800', '\udc00', '\u0000']) {
      const res = await post({ ...sample, story: sample.story + bad });
      assert.equal(res.status, 422, 'unsafe Unicode U+' + bad.codePointAt(0).toString(16));
      assert.deepEqual(await res.json(), { valid: false, errors: ['story'] });
    }
    const badUtf8 = await post(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
    assert.equal(badUtf8.status, 400);
    assert.deepEqual(await badUtf8.json(), { error: 'invalid_json' });
    for (const type of ['application/json; charset=utf-16', 'application/json; unexpected=x']) {
      const res = await post(sample, { 'content-type': type });
      assert.equal(res.status, 415);
      assert.deepEqual(await res.json(), { error: 'json_required' });
    }
    const compressed = await post(sample, { 'content-encoding': 'gzip' });
    assert.equal(compressed.status, 415);
    assert.deepEqual(await compressed.json(), { error: 'unsupported_content_encoding' });
    for (const route of ['/backend/server.js', '/.github/workflows/ci.yml', '/%2e%2e/backend/server.js']) {
      const res = await fetch(base + route);
      assert.equal(res.status, 404, 'blocked static path ' + route);
    }
    const crossSite = await post(sample, { 'sec-fetch-site': 'same-site' });
    assert.equal(crossSite.status, 403);
    assert.deepEqual(await crossSite.json(), { error: 'same_origin_required' });
    const wrongPort = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: server.address().port, path: '/health',
        headers: { host: 'localhost:1' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.equal(wrongPort, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
