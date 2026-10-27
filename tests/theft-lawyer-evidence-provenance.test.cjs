'use strict';
// Synthetic-only: lawyer intake must separate evidentiary provenance,
// procedural chronology and disputed possession without collecting identities.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ questionsFor })', {}, { timeout: 1000 }
);

test('theft lawyer intake records role, chronology and source of each assertion', () => {
  const lawyer = questionsFor('theft', 'وکیل');
  assert.equal(lawyer.length, 5);
  const prompt = lawyer.at(-1);
  for (const phrase of ['نقش موکل', 'مرحله فعلی پرونده', 'تاریخ تقریبی واقعه',
    'آخرین ابلاغ', 'مشاهده مستقیم شاهد', 'گزارش انتظامی', 'تصویر دوربین',
    'صرفاً نقل دیگران', 'اصل فایل و زمان تهیه آن']) {
    assert.ok(prompt.includes(phrase), 'missing intake distinction: ' + phrase);
  }
});

test('theft lawyer intake is privacy-aware and does not predetermine legal findings', () => {
  const prompt = questionsFor('theft', 'وکیل').at(-1);
  assert.match(prompt, /بدون شماره پرونده یا مشخصات اشخاص/);
  assert.match(prompt, /از انتشار عمومی تصویر اشخاص خودداری کنید/);
  assert.match(prompt, /با رضایت تحویل شده یا بدون رضایت از تصرف خارج شده/);
  assert.match(prompt, /قانون لازم‌الاجرا و بررسی انسانی/);
  assert.match(prompt, /نتیجه قطعی ندهید/);
  for (const role of ['شاهد', 'خوانده / متهم', 'خواهان / شاکی']) {
    assert.doesNotMatch(questionsFor('theft', role).at(-1), /نقش موکل \(شاکی یا متهم\)/);
  }
});
