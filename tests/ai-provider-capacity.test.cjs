'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatHandler } = require('../backend/ai-handler');
const token = Buffer.alloc(32, 7).toString('base64url'); // synthetic only
function request() {
  return {
    method: 'POST',
    url: '/api/ai-chat',
    rawHeaders: ['Authorization', 'Bearer ' + token, 'Content-Type', 'application/json'],
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

test('provider 429 pauses authenticated retries for five minutes without consuming quota', async () => {
  let time = 1000, calls = 0;
  const handle = createChatHandler({
    env: { DADYAR_PREVIEW_TOKEN: token, OPENAI_API_KEY: 'synthetic-test-only' },
    now: () => time,
    answer: async () => {
      calls++;
      if (calls === 1) { const e = new Error('private'); e.status = 429; throw e; }
      return {answer:'synthetic answer'};
    }
  });
  async function invoke(req = request()) {
    let result;
    await handle(req, (status, body) => { result = {status, body}; });
    return result;
  }
  assert.equal((await invoke()).status, 503);
  for (let i = 0; i < 35; i++) assert.deepEqual(await invoke(), {
    status:503, body:{error:'provider_capacity_unavailable'}
  });
  assert.equal(calls, 1);
  const unauthorized = request(); unauthorized.rawHeaders = [];
  assert.equal((await invoke(unauthorized)).status, 401);
  time += 299999;
  assert.equal((await invoke()).status, 503);
  time++;
  assert.equal((await invoke()).status, 200);
  assert.equal(calls, 2);
});

test('provider capacity failure during body reading blocks a pending request before upstream call', async () => {
  let calls = 0, unblock;
  const handle = createChatHandler({
    env:{DADYAR_PREVIEW_TOKEN:token, OPENAI_API_KEY:'synthetic-test-only'},
    answer:async()=>{calls++; const e=new Error('private'); e.status=429; throw e;}
  });
  const delayed = request(), original = delayed[Symbol.asyncIterator];
  delayed[Symbol.asyncIterator] = async function* () {
    await new Promise(resolve=>{unblock=resolve;});
    yield* original();
  };
  let pendingResult;
  const pending = handle(delayed,(status,body)=>{pendingResult={status,body};});
  await handle(request(),()=>{});
  unblock(); await pending;
  assert.deepEqual(pendingResult,{status:503,body:{error:'provider_capacity_unavailable'}});
  assert.equal(calls,1);
});

test('unauthenticated requests do not reveal missing provider configuration', async () => {
  const envs = [
    {},
    { DADYAR_PREVIEW_TOKEN: token },
    { DADYAR_PREVIEW_TOKEN: 'invalid', OPENAI_API_KEY: 'synthetic-test-only' },
    { DADYAR_PREVIEW_TOKEN: token, OPENAI_API_KEY: 'synthetic-test-only' }
  ];
  for (const env of envs) {
    let calls = 0, response;
    const handle = createChatHandler({ env, answer: async () => { calls++; return { answer: 'synthetic' }; } });
    const req = request();
    req.rawHeaders = [];
    delete req.headers.authorization;
    await handle(req, (status, body) => { response = { status, body }; });
    assert.deepEqual(response, { status: 401, body: { error: 'authentication_required' } });
    assert.equal(calls, 0);
  }
});

test('authenticated requests with missing provider key fail closed', async () => {
  let calls = 0, response;
  const handle = createChatHandler({
    env: { DADYAR_PREVIEW_TOKEN: token },
    answer: async () => { calls++; return { answer: 'synthetic' }; }
  });
  await handle(request(), (status, body) => { response = { status, body }; });
  assert.deepEqual(response, { status: 503, body: { error: 'ai_not_configured' } });
  assert.equal(calls, 0);
});
