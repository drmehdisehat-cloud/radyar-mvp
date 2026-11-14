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

test('checksum-valid contiguous identifiers are blocked before provider call', async () => {
  const luhnDigit = prefix => {
    for (let n = 0; n <= 9; n++) {
      const digits = prefix + n;
      let sum = 0;
      for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
        let d = Number(digits[i]);
        if (double) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
      }
      if (sum % 10 === 0) return digits;
    }
    throw new Error('no check digit');
  };
  const nationalPrefix = '123456789';
  const remainder = [...nationalPrefix].reduce((sum, digit, i) => sum + Number(digit) * (10 - i), 0) % 11;
  const nationalId = nationalPrefix + (remainder < 2 ? remainder : 11 - remainder);
  for (const identifier of [luhnDigit('400000000000000'), nationalId]) {
    assert.equal(containsObviousIdentifier('شناسه فرضی ' + identifier), true);
    assert.equal(validateChat(payload('شناسه فرضی ' + identifier)), false);
    let calls = 0;
    await assert.rejects(answerChat(payload('شناسه فرضی ' + identifier), {
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => { calls++; throw new Error('provider should not be called'); }
    }), /invalid_chat/);
    assert.equal(calls, 0);
  }
  assert.equal(containsObviousIdentifier('شماره ساختگی 1111111111'), false);
});

test('provider output with obvious identifiers is not returned to the caller', async () => {
  for (const unsafe of ['test.person@example.org', '۰۹۱۲ ۳۴۵ ۶۷۸۹']) {
    await assert.rejects(answerChat(payload('سؤال فرضی درباره چک'), {
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => ({ ok: true, json: async () => ({
        status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: unsafe }] }]
      }) })
    }), error => error.message === 'unsafe_provider_output' && !error.message.includes(unsafe));
  }
});

test('invisible Unicode controls cannot hide identifiers from input and output guards', async () => {
  const samples = [
    'test.person@ex\u200Bample.org',
    '۰۹۱۲\u200C۳۴۵۶۷۸۹',
    'IR12\u2060 1234 1234 1234 1234 1234 12'
  ];
  for (const unsafe of samples) {
    assert.equal(containsObviousIdentifier(unsafe), true);
    assert.equal(validateChat(payload(unsafe)), false);
    let calls = 0;
    await assert.rejects(answerChat(payload(unsafe), {
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => { calls++; throw new Error('unexpected provider call'); }
    }), /invalid_chat/);
    assert.equal(calls, 0);
    await assert.rejects(answerChat(payload('سؤال فرضی چک'), {
      apiKey: 'synthetic-test-only',
      fetchImpl: async () => ({ ok: true, json: async () => ({
        status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: unsafe }] }]
      }) })
    }), error => error.message === 'unsafe_provider_output');
  }
});
