'use strict';
// Synthetic-only regression test: never include real client or case data.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const topics = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];
const fixture = () => ({
  topic: 'theft', role: 'شاهد',
  story: 'شرح کاملاً ساختگی برای آزمون امنیت ورودی',
  answers: ['پاسخ ساختگی ۱', 'پاسخ ساختگی ۲', 'پاسخ ساختگی ۳', 'پاسخ ساختگی ۴', 'پاسخ ساختگی ۵']
});
const accepts = (payload, label) => assert.equal(validateCase(payload).valid, true, label);
const rejects = (payload, field) => {
  const result = validateCase(payload);
  assert.equal(result.valid, false, 'must reject ' + field);
  assert.ok(result.errors.includes(field), 'must report ' + field);
};
for (const topic of topics) for (const role of roles) {
  accepts({ ...fixture(), topic, role }, topic + '/' + role);
}
rejects(null, 'payload');
rejects([], 'payload');
rejects({ ...fixture(), topic: 'unknown' }, 'topic');
rejects({ ...fixture(), role: 'unknown' }, 'role');
rejects({ ...fixture(), answers: [] }, 'answers');
rejects({ ...fixture(), answers: ['۱', '۲', '۳', '۴', '...'] }, 'answers');
rejects({ ...fixture(), story: '          ' }, 'story');
rejects({ ...fixture(), story: 'شرح ساختگی\u202e جهت متن' }, 'story');
rejects({ ...fixture(), story: 'شرح ساختگی\u200b مخفی' }, 'story');
rejects({ ...fixture(), story: 'شرح ساختگی\ud800' }, 'story');
rejects({ ...fixture(), answers: ['\udc00', '۲', '۳', '۴', '۵'] }, 'answers');
rejects({ ...fixture(), answers: ['۱', '۲', '۳', '۴', '؛...'] }, 'answers');
rejects({ ...fixture(), story: 'الف'.repeat(5001) }, 'story');
rejects({ ...fixture(), answers: ['الف'.repeat(2001), '۲', '۳', '۴', '۵'] }, 'answers');
rejects({ ...fixture(), secret: 'synthetic-only' }, 'unexpected_fields');
accepts({ ...fixture(), story: 'ا'.repeat(5000) }, 'maximum permitted story length');
accepts({ ...fixture(), answers: ['ا'.repeat(2000), '۲', '۳', '۴', '۵'] }, 'maximum permitted answer length');
accepts({ ...fixture(), story: 'شرح ساختگی با نیم‌فاصله و متن فارسی' }, 'Persian ZWNJ');
console.log('PASS: 24 role/topic paths + 18 synthetic input-security boundaries');
