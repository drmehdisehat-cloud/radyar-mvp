'use strict';
// Synthetic-only live HTTP regression. Loopback peer + rewritten Host must not
// be mistaken for proof that a reverse-proxied request originated locally.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../backend/server');

const sample = {
  topic: 'fraud', role: 'شاهد',
  story: 'پرونده کاملاً ساختگی برای آزمون مرز پروکسی محلی',
  answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم'],
};

test('local API refuses reverse-proxy markers while preserving direct loopback', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (headers = {}) => fetch(base + '/api/cases/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(sample),
    signal: AbortSignal.timeout(4000),
  });
  try {
    const health = await fetch(base + '/health', { signal: AbortSignal.timeout(4000) });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).storage, false);
    const normal = await post();
    assert.equal(normal.status, 200);
    assert.deepEqual(await normal.json(), { valid: true, errors: [] });

    for (const [header, value] of [
      ['Forwarded', 'for=198.51.100.5;proto=https'],
      ['X-Forwarded-For', '198.51.100.5'],
      ['X-Forwarded-Host', 'example.invalid'],
      ['X-Forwarded-Proto', 'https'],
      // Some reverse proxies send only a less common forwarding marker.
      // A loopback peer alone must never make these look like direct requests.
      ['X-Forwarded-Port', '443'],
      ['X-Forwarded-Prefix', '/public'],
      ['X-Forwarded-Server', 'proxy.invalid'],
      ['X-Original-Host', 'example.invalid'],
      ['X-Original-URL', '/api/cases/validate'],
      ['X-Rewrite-URL', '/api/cases/validate'],
      ['X-Real-IP', '198.51.100.5'],
      ['Via', '1.1 proxy.invalid'],
    ]) {
      const denied = await post({ [header]: value });
      assert.equal(denied.status, 403, header);
      assert.equal(denied.headers.get('cache-control'), 'no-store', header);
      assert.deepEqual(await denied.json(), { error: 'local_origin_required' }, header);
      const deniedHealth = await fetch(base + '/health', {
        headers: { [header]: value }, signal: AbortSignal.timeout(4000),
      });
      assert.equal(deniedHealth.status, 403, header + ' on GET');
      assert.deepEqual(await deniedHealth.json(), { error: 'local_origin_required' });
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
