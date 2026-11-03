'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { answerChat } = require('../backend/ai-chat');

const payload = { syntheticOnly: true, messages: [{ role: 'user', content: 'سناریوی فرضی چک؛ چه ابهام‌هایی باید روشن شود؟' }] };
function fakeProvider(text) {
  return async () => ({
    ok: true,
    async json() {
      return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] };
    },
  });
}
test('experimental AI output refuses unsupported numbered Persian legal citations', async () => {
  for (const answer of ['طبق ماده ۱۲۳ قانون', 'تبصره‌ ۴', 'اصل ۳۴', 'Article 123', 'ماده‌ی ۱۲', 'مادهٔ ۱۲', 'ماده شماره ۲', 'تبصره ی ۴']) {
    await assert.rejects(
      answerChat(payload, { apiKey: 'synthetic-test-only', fetchImpl: fakeProvider(answer) }),
      /unverified_legal_citation/
    );
  }
});
test('experimental AI output still permits uncertainty and interview questions', async () => {
  const result = await answerChat(payload, {
    apiKey: 'synthetic-test-only',
    fetchImpl: fakeProvider('برای بررسی فرضی، تاریخ سررسید و وضعیت پرداخت را روشن کنید. منبع قانونی تأیید نشده است.'),
  });
  assert.equal(result.experimental, true);
  assert.equal(result.legalSourcesVerified, false);
  assert.match(result.answer, /تاریخ سررسید/);
  assert.match(result.answer, /بازبینی وکیل/);
});
