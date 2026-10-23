'use strict';
// Synthetic objects passed directly to validateCase must follow the same
// enumerable-data-property contract as parsed JSON objects.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation');
const fixture = () => ({
  topic: 'theft',
  role: 'شاهد',
  story: 'شرح آزمایشی پرونده کاملاً ساختگی',
  answers: ['۱', '۲', '۳', '۴', '۵'],
});
assert.equal(validateCase(fixture()).valid, true);
for (const key of ['topic', 'role', 'story', 'answers']) {
  const hidden = fixture();
  Object.defineProperty(hidden, key, { value: hidden[key], enumerable: false });
  const result = validateCase(hidden);
  assert.equal(result.valid, false, `non-enumerable required field accepted: ${key}`);
  assert.ok(result.errors.includes(key), `missing error for hidden ${key}`);
}
console.log('PASS: four required case fields must be own enumerable data properties');
