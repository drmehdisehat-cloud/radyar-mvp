'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createLocalChatPreview } = require('../backend/preview-chat-local');

test('authenticated synthetic chat reaches mocked answer; unauthenticated and wrong tokens are denied', async () => {
  const token = randomBytes(32).toString('base64url');
  let calls = 0;
  const server = createLocalChatPreview({
    env: { DADYAR_PREVIEW_TOKEN: token, OPENAI_API_KEY: 'synthetic-test-only' },
    answer: async () => { calls++; return { answer: 'پاسخ آزمایشی بدون استناد قانونی', experimental: true, legalSourcesVerified: false }; },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const payload = JSON.stringify({ syntheticOnly: true, messages: [{ role: 'user', content: 'چک فرضی پرداخت نشده است؛ قدم بعدی چیست؟' }] });
  try {
    for (const authorization of [undefined, 'Bearer ' + randomBytes(32).toString('base64url')]) {
      const headers = { 'Content-Type': 'application/json' };
      if (authorization) headers.Authorization = authorization;
      const response = await fetch(base + '/api/chat', { method: 'POST', headers, body: payload });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(calls, 0, 'denied requests must not reach the model');
    const ok = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).experimental, true);
    assert.equal(calls, 1);
    const invalid = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ syntheticOnly: false, messages: [{ role: 'user', content: 'واقعی' }] }),
    });
    assert.equal(invalid.status, 422);
    assert.equal(calls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('injected staging and production modes cannot create a local chat server', () => {
  for (const mode of ['production', 'staging', 'Production', '', 'test']) {
    assert.throws(() => createLocalChatPreview({
      env: { NODE_ENV: mode, DADYAR_PREVIEW_TOKEN: randomBytes(32).toString('base64url'), OPENAI_API_KEY: 'synthetic-test-only' },
      answer: async () => ({ experimental: true }),
    }), /non-development mode/);
  }
});
