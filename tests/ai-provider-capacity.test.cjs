'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatHandler } = require('../backend/ai-handler');
const token = Buffer.alloc(32, 7).toString('base64url'); // synthetic only
function request() {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ syntheticOnly: true, messages: [
        { role: 'user', content: 'پرونده کاملاً فرضی چک؛ نقش خواهان چیست؟' }
      ] }));
    }
  };
}
for (const [upstream, expectedStatus, expectedError] of [
  [429, 503, 'provider_capacity_unavailable'],
  [500, 502, 'provider_unavailable']
]) {
  test('upstream '+upstream+' is not confused with local preview quota', async () => {
    const answer = async () => { const error = new Error('private upstream detail'); error.status = upstream; throw error; };
    const handle = createChatHandler({ env: { DADYAR_PREVIEW_TOKEN: token, OPENAI_API_KEY: 'synthetic-test-only' }, answer });
    let result;
    await handle(request(), (status, body) => { result = { status, body }; });
    assert.deepEqual(result, { status: expectedStatus, body: { error: expectedError } });
    assert.doesNotMatch(JSON.stringify(result), /private upstream detail|synthetic-test-only/);
  });
}
