'use strict';
// Synthetic source metadata only. A link-review timestamp cannot prove legal validity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({
  state: {
    topic: 'check', role: 'شاهد', story: 'شرح ساختگی بدون مشخصات واقعی',
    answers: Array(5).fill('پاسخ فرضی')
  },
  $: () => ({})
});
for (const filename of ['flows.js', 'export.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, filename), 'utf8'), ctx);
}
vm.runInContext("flows.check.source = {title:'منبع ساختگی برای آزمون', url:'https://qavanin.ir/Law/TreeText/?IDS=1', checked:'2026-10-19'}", ctx);
const report = vm.runInContext('report()', ctx);
assert.match(report, /اعتبار حقوقی تأیید نشده/);
assert.match(report, /تاریخ درج‌شده در داده‌های آزمایشی \(نه تاریخ اعتبار قانون\): 2026-10-19/);
assert.match(report, /متن تنقیح‌شده، اصلاحات، نسخ و قابلیت استناد در پرونده بررسی نشده است/);
assert.doesNotMatch(report, /تاریخ بازبینی لینک|قانون لازم‌الاجرا است|اعتبار قانون تأیید شد/);
const renderer = fs.readFileSync(path.join(root, 'export.js'), 'utf8');
assert.match(renderer, /این تاریخ، تاریخ اعتبار قانون نیست/);
assert.doesNotMatch(renderer, /پیوند در '\s*\+\s*f\.source\.checked\s*\+\s*' بازبینی شده/);
console.log('PASS: synthetic report never presents source-link metadata as verified law');
