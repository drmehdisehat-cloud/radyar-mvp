'use strict';
// Synthetic-only security regression for direct validator callers.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const fixture = () => ({
  topic: 'theft', role: 'شاهد',
  story: 'شرح کاملاً ساختگی برای آزمون اعتبارسنجی',
  answers: ['پاسخ ۱', 'پاسخ ۲', 'پاسخ ۳', 'پاسخ ۴', 'پاسخ ۵']
});
function rejected(payload, label) {
  const result = validateCase(payload);
  assert.equal(result.valid, false, label);
  assert.ok(result.errors.includes('answers') || result.errors.includes('topic'), label);
}
assert.equal(validateCase(fixture()).valid, true, 'dense own answers should pass');
const missing = fixture();
missing.answers = new Array(5);
rejected(missing, 'all sparse slots');
const inherited = fixture();
delete inherited.answers[2];
const prototype = Object.create(Array.prototype);
prototype[2] = 'پاسخ ارث‌بری‌شده';
Object.setPrototypeOf(inherited.answers, prototype);
rejected(inherited, 'inherited answer must not count as own answer');
const getter = fixture();
delete getter.answers[2];
const dangerous = Object.create(Array.prototype);
Object.defineProperty(dangerous, '2', {
  get() { throw new Error('inherited getter must not execute'); }
});
Object.setPrototypeOf(getter.answers, dangerous);
assert.doesNotThrow(() => rejected(getter, 'inherited getter'));
const inheritedFields = Object.create(fixture());
assert.equal(validateCase(inheritedFields).valid, false, 'inherited payload fields');
console.log('PASS: synthetic sparse, inherited, and getter-backed answers rejected');
