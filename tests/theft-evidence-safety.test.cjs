'use strict';
// Synthetic-only: safety and evidence-preservation intake, not legal advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flows, questionsFor } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8') +
  '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('theft intake checks urgent harm without asking for an exact safe location', () => {
  const q = flows.theft.questions;
  assert.equal(q.length, 4);
  assert.match(q[0], /نشانی دقیق منزل یا محل امن/);
  assert.match(q[1], /خطر فوری یا نیاز به کمک پزشکی/);
  assert.match(q[1], /مواجهه مستقیم/);
  assert.match(q[1], /مستقیماً/);
});

test('theft intake distinguishes original evidence from a report or hearsay', () => {
  const q = flows.theft.questions;
  const docs = flows.theft.docs.join(' ');
  assert.match(q[2], /اصل فایل و زمان ثبت/);
  assert.match(q[3], /در معرض حذف یا بازنویسی/);
  assert.match(q[3], /نسخه اصلی مدارک را بدون ویرایش/);
  assert.match(q[3], /اطلاعات هویتی اشخاص ثالث/);
  assert.match(docs, /از دستکاری فایل اصلی یا انتشار عمومی چهره/);
  assert.equal(Object.hasOwn(flows.theft, 'source'), false);
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('theft', role).length, 5);
  }
});
