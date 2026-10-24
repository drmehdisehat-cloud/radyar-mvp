'use strict';
// Live HTTP regression: synthetic case text must never be reflected by API
// responses, including validation errors and rate-limit denials.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../backend/server');

const marker = 'SYNTHETIC_CASE_MARKER_NOT_A_PERSON_001';
const sample = {
  topic: 'fraud', role: 'شاهد',
  story: 'پرونده فرضی برای آزمون عدم افشای داده ' + marker,
  answers: ['پاسخ ساختگی ' + marker, 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم'],
};

test('live API never reflects synthetic case contents or permits caching', async () => {
  const server = createServer({ rateLimit: { max: 4, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const endpoint = base + '/api/cases/validate';
  const post = (body, headers = {}) => fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  async function assertPrivate(response, expectedStatus) {
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type') || '', /^application\/json/i);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const text = await response.text();
    assert.doesNotMatch(text, /SYNTHETIC_CASE_MARKER_NOT_A_PERSON_001/);
    return JSON.parse(text);
  }
  try {
    assert.deepEqual(await assertPrivate(await post(sample), 200), { valid: true, errors: [] });
    assert.deepEqual(await assertPrivate(await post({ ...sample, role: 'نقش نامعتبر ' + marker }), 422),
      { valid: false, errors: ['role'] });
    assert.deepEqual(await assertPrivate(await post('{"story":"' + marker + '",BROKEN'), 400),
      { error: 'invalid_json' });
    assert.deepEqual(await assertPrivate(await post(sample, { 'content-type': 'text/plain' }), 415),
      { error: 'json_required' });
    assert.deepEqual(await assertPrivate(await post(sample, { origin: 'https://attacker.invalid' }), 403),
      { error: 'local_origin_required' });
    assert.deepEqual(await assertPrivate(await post(sample), 429), { error: 'rate_limited' });
    const health = await fetch(base + '/health', { signal: AbortSignal.timeout(4000) });
    const status = await assertPrivate(health, 200);
    assert.equal(status.storage, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
