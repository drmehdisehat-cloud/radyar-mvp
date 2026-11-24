'use strict';
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const base = {
  topic: 'theft', role: 'شاهد', story: 'این یک پرونده کاملاً فرضی برای آزمایش است',
  answers: ['پاسخ یک', 'پاسخ دو', 'پاسخ سه', 'پاسخ چهار', 'پاسخ پنج']
};
const check = (value, expected) => assert.equal(validateCase(value).valid, expected);
check(base, true);
check({ ...base, story: 'این‌یک‌متن‌فارسی‌معتبر‌است' }, true); // Persian ZWNJ
for (const story of ['...........', '          !', '\u200B'.repeat(12), '\u202E'.repeat(12), '\uD800'.repeat(12), '\uFEFF'.repeat(12)]) {
  check({ ...base, story }, false);
}
for (const answer of ['...', '\u200B', '\u202E', '\uD800']) {
  check({ ...base, answers: [answer, ...base.answers.slice(1)] }, false);
}
check({ ...base, secret: 'synthetic-only' }, false);
check({ ...base, answers: [] }, false);
console.log('PASS: 14 synthetic semantic-content and privacy regression checks');
