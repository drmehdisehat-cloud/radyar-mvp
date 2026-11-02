'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChat, containsObviousIdentifier, answerChat } = require('../backend/ai-chat');
const payload = text => ({ syntheticOnly:true, messages:[{role:'user',content:text}] });
test('synthetic conversation rejects obvious personal identifiers including Persian digits', () => {
  for (const text of [
    'شماره تماس ۰۹۱۲ ۳۴۵ ۶۷۸۹',
    'شماره تماس +98 (912) 345-6789',
    'نشانی test.person@example.org',
    'شبا IR12 1234 1234 1234 1234 1234 12',
    'کارت 1234-5678-9012-3456'
  ]) {
    assert.equal(containsObviousIdentifier(text), true, text);
    assert.equal(validateChat(payload(text)), false, text);
  }
});
test('fictional legal questions without identifiers remain valid', () => {
  assert.equal(validateChat(payload('پرونده کاملاً فرضی چک؛ چه مدارکی باید بررسی شود؟')), true);
  assert.equal(validateChat(payload('مطالبه وجه فرضی به مبلغ ۱۰۰ میلیون تومان')), true);
});
test('blocked payload never calls provider', async () => {
  let calls = 0;
  await assert.rejects(answerChat(payload('test.person@example.org'), {
    apiKey:'synthetic-test-only', fetchImpl:async()=>{ calls++; throw new Error('should not call'); }
  }), /invalid_chat/);
  assert.equal(calls, 0);
});
