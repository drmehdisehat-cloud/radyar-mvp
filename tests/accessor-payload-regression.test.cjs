'use strict';
// Synthetic-only hardening for direct validator calls. JSON HTTP inputs do not
// contain getters, but future internal callers must not execute untrusted ones.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const fixture = () => ({
  topic: 'fraud', role: 'شاهد',
  story: 'شرح ساختگی برای آزمون محافظت از داده ورودی',
  answers: ['پاسخ ۱', 'پاسخ ۲', 'پاسخ ۳', 'پاسخ ۴', 'پاسخ ۵'],
});
let checked = 0;
function rejectWithoutExecution(value, label) {
  let result;
  assert.doesNotThrow(() => { result = validateCase(value); }, label);
  assert.equal(result.valid, false, label);
  checked++;
}
for (const key of ['topic', 'role', 'story', 'answers']) {
  const payload = fixture();
  Object.defineProperty(payload, key, {
    enumerable: true, configurable: true,
    get() { throw new Error('untrusted ' + key + ' getter executed'); },
  });
  rejectWithoutExecution(payload, 'own accessor ' + key);
}
for (const index of [0, 2, 4]) {
  const payload = fixture();
  Object.defineProperty(payload.answers, index, {
    enumerable: true, configurable: true,
    get() { throw new Error('untrusted array getter executed'); },
  });
  rejectWithoutExecution(payload, 'own accessor answer ' + index);
}
const trap = new Proxy(fixture(), {
  getOwnPropertyDescriptor() { throw new Error('proxy descriptor trap'); },
});
rejectWithoutExecution(trap, 'throwing proxy descriptor');
const revoked = Proxy.revocable(fixture(), {});
revoked.revoke();
rejectWithoutExecution(revoked.proxy, 'revoked proxy');
assert.deepEqual(validateCase(fixture()), { valid: true, errors: [] });
assert.deepEqual(validateCase(JSON.parse(JSON.stringify(fixture()))), { valid: true, errors: [] });
console.log('PASS: 9 synthetic accessor/proxy payloads rejected without throwing');
