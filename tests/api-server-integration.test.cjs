'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

const sample = Object.freeze({
  topic: 'fraud', role: 'خواهان / شاکی',
  story: 'این یک پرونده کاملاً ساختگی برای آزمون رابط محلی است.',
  answers: ['پاسخ یک', 'پاسخ دو', 'پاسخ سه', 'پاسخ چهار', 'پاسخ پنج'],
});
const send = (url, body, headers = {}) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('development API: local-only validation, privacy and rate limit', async () => {
  const server = createServer({ rateLimit: { max: 5, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).storage, false);
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const endpoint = base + '/api/cases/validate';
    const accepted = await send(endpoint, sample);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { valid: true, errors: [] });
    const invalid = await send(endpoint, { ...sample, role: 'نامعتبر' });
    assert.equal(invalid.status, 422);
    assert.deepEqual(await invalid.json(), { valid: false, errors: ['role'] });
    const crossOrigin = await send(endpoint, sample, { origin: 'https://attacker.invalid' });
    assert.equal(crossOrigin.status, 403);
    const crossSite = await send(endpoint, sample, { 'sec-fetch-site': 'cross-site' });
    assert.equal(crossSite.status, 403);
    const unsupported = await send(endpoint, sample, { 'content-type': 'text/plain' });
    assert.equal(unsupported.status, 415);
    const malformed = await send(endpoint, '{broken');
    assert.equal(malformed.status, 400);
    const forgedHost = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: server.address().port,
        path: '/health', headers: { host: 'attacker.invalid' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      }).on('error', reject);
    });
    assert.equal(forgedHost, 403);
    const limited = await send(endpoint, sample);
    assert.equal(limited.status, 200);
    const denied = await send(endpoint, sample);
    assert.equal(denied.status, 429);
    assert.deepEqual(await denied.json(), { error: 'rate_limited' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
