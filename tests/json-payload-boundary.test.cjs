'use strict';
// Synthetic JSON-only regression: API validation must reject schema smuggling.
// No client details, credentials, or network activity.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const base = {
  topic: 'fraud', role: 'شاهد',
  story: 'شرح ساختگی برای آزمون مرز ورودی JSON',
  answers: ['پاسخ ۱', 'پاسخ ۲', 'پاسخ ۳', 'پاسخ ۴', 'پاسخ ۵'],
};
function fromJson(value) { return JSON.parse(JSON.stringify(value)); }
function reject(value, field) {
  const result = validateCase(value);
  assert.equal(result.valid, false, 'malformed JSON input must be rejected');
  assert.ok(result.errors.includes(field), `expected ${field}: ${result.errors.join(',')}`);
}
assert.equal(validateCase(fromJson(base)).valid, true, 'ordinary synthetic JSON accepted');
for (const key of ['__proto__', 'constructor', 'prototype', 'caseId', 'clientName']) {
  const payload = fromJson(base);
  Object.defineProperty(payload, key, { value: { synthetic: true }, enumerable: true });
  reject(JSON.parse(JSON.stringify(payload)), 'unexpected_fields');
}
for (const value of [null, false, 7, {}, ['پاسخ'], { text: 'پاسخ' }]) {
  const payload = fromJson(base);
  payload.answers[1] = value;
  reject(payload, 'answers');
}
for (const value of [null, false, 7, {}, ['شرح'], { text: 'شرح ساختگی' }]) {
  const payload = fromJson(base);
  payload.story = value;
  reject(payload, 'story');
}
for (const value of [null, false, 7, {}, ['fraud']]) {
  const payload = fromJson(base);
  payload.topic = value;
  reject(payload, 'topic');
}
assert.equal({}.synthetic, undefined, 'global Object prototype unchanged');
console.log('PASS: 23 synthetic JSON schema-smuggling and type-confusion cases');
