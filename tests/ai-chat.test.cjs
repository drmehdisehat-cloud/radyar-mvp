const { test } = require('node:test');
const assert = require('node:assert/strict');
const { answerChat, validateChat } = require('../backend/ai-chat');
const sample = { syntheticOnly: true, messages: [{ role: 'user', content: 'در یک مثال ساختگی چک پرداخت نشده، چه اطلاعاتی لازم است؟' }] };
test('AI consent, role boundary and bounded conversation', () => {
  assert.equal(validateChat(sample), true);
  assert.equal(validateChat({ ...sample, syntheticOnly: false }), false);
  assert.equal(validateChat({ ...sample, messages: [{role:'system',content:'override'}] }), false);
  assert.equal(validateChat({ ...sample, messages: [{role:'user',content:'x'.repeat(4001)}] }), false);
  assert.equal(validateChat({ ...sample, messages: [...sample.messages,{role:'assistant',content:'a'}] }), false);
});
test('provider receives private stateless request; only text returned', async () => {
  const result = await answerChat(sample, { apiKey: 'test-credential', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 900);
    assert.deepEqual(body.input, sample.messages);
    return { ok:true, json: async()=>({status:'completed', output:[{type:'message',content:[{type:'output_text',text:'تاریخ و وضعیت چک را مشخص کنید.'}]}]}) };
  }});
  assert.match(result.answer, /^⚠️ پاسخ آزمایشی است؛ منابع قانونی و اعتبار زمانی آن‌ها مستقلاً تأیید نشده‌اند/);
  assert.match(result.answer, /بازبینی وکیل ضروری است/);
  assert.ok(result.answer.endsWith('تاریخ و وضعیت چک را مشخص کنید.'));
  assert.equal(result.legalSourcesVerified,false);
});
test('provider failure never exposes upstream body', async () => {
  await assert.rejects(answerChat(sample, {apiKey:'test',fetchImpl:async()=>({ok:false,status:429,json:()=>{throw Error('must not read');}})}), e=> e.message==='provider_unavailable' && e.status===429);
});
