'use strict';
// Live loopback-only HTTP checks with synthetic content. Never use client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../backend/server');

const MAX_BODY = 64 * 1024;
const sample = {
  topic: 'fraud', role: 'شاهد',
  story: 'ا'.repeat(5000),
  answers: Array.from({ length: 5 }, () => 'ب'.repeat(2000)),
};

function chunkedPost(port, bytes) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/cases/validate', method: 'POST',
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end(bytes);
  });
}

test('live API accepts maximum Persian interview but rejects oversized bytes', async () => {
  const server = createServer({ rateLimit: { max: 10, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/cases/validate`;
  try {
    const allowed = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sample), signal: AbortSignal.timeout(5000),
    });
    assert.ok(Buffer.byteLength(JSON.stringify(sample), 'utf8') > 16 * 1024,
      'Persian fixture must exercise multibyte request sizing');
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { valid: true, errors: [] });

    const oversized = Buffer.alloc(MAX_BODY + 1, 0x58);
    const lengthResponse = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: oversized, signal: AbortSignal.timeout(5000),
    });
    assert.equal(lengthResponse.status, 413, 'Content-Length above cap must fail');
    assert.equal(lengthResponse.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await lengthResponse.json(), { error: 'payload_too_large' });

    const streamed = await chunkedPost(port, oversized);
    assert.equal(streamed.status, 413, 'chunked body above cap must fail');
    assert.equal(streamed.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(streamed.text), { error: 'payload_too_large' });
    assert.doesNotMatch(streamed.text, /الف|ب/, 'never reflect synthetic case data');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
