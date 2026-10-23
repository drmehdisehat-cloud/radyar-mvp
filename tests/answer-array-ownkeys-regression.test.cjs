'use strict';
// Synthetic-only regression: additional answer-array keys must not bypass schema.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const fixture = () => ({
  topic: 'fraud', role: 'شاهد',
  story: 'شرح کاملاً ساختگی برای آزمون ساختار پاسخ‌ها',
  answers: ['پاسخ ۱', 'پاسخ ۲', 'پاسخ ۳', 'پاسخ ۴', 'پاسخ ۵'],
});
assert.equal(validateCase(fixture()).valid, true, 'ordinary JSON-compatible answers');
let checked = 0;
function reject(answers, reason) {
  const result = validateCase({ ...fixture(), answers });
  assert.equal(result.valid, false, reason);
  assert.ok(result.errors.includes('answers'), reason);
  checked++;
}
const enumerable = fixture().answers;
enumerable.clientName = 'SYNTHETIC';
reject(enumerable, 'enumerable unexpected array field');
const hidden = fixture().answers;
Object.defineProperty(hidden, 'caseNumber', { value: 'SYNTHETIC', enumerable: false });
reject(hidden, 'non-enumerable unexpected array field');
const symbol = fixture().answers;
symbol[Symbol('synthetic')] = 'SYNTHETIC';
reject(symbol, 'symbol unexpected array field');
const disguisedIndex = fixture().answers;
disguisedIndex['05'] = 'SYNTHETIC';
reject(disguisedIndex, 'noncanonical array index');
const hostile = new Proxy(fixture().answers, { ownKeys() { throw new Error('synthetic trap'); } });
const hostileResult = validateCase({ ...fixture(), answers: hostile });
assert.deepEqual(hostileResult, { valid: false, errors: ['payload'] }, 'ownKeys proxy trap must fail closed');
checked++;
const hiddenIndex = fixture().answers;
Object.defineProperty(hiddenIndex, '2', { value: 'پاسخ ۳', enumerable: false });
reject(hiddenIndex, 'non-enumerable answer index is not JSON-compatible');
assert.equal(validateCase(JSON.parse(JSON.stringify(fixture()))).valid, true);
console.log(`PASS: ${checked} synthetic answer-array schema boundaries`);
