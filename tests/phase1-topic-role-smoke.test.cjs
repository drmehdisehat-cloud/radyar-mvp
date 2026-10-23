'use strict';
// Synthetic contract smoke for all phase-one topics and user roles.
// This verifies schema routing only, not legal accuracy or case advice.
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation');
const topics = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];
const synthetic = {
  story: 'شرح کاملاً ساختگی برای بررسی ساختار پرونده بدون داده موکل',
  answers: ['پاسخ ساختگی', 'نامشخص', 'پاسخ ساختگی', 'پاسخ ساختگی', 'پاسخ ساختگی']
};
for (const topic of topics) for (const role of roles) {
  assert.deepEqual(validateCase({ ...synthetic, topic, role }),
    { valid: true, errors: [] }, `${topic}/${role}`);
}
assert.equal(validateCase({ ...synthetic, topic: 'theft', role: 'وکیل', secret: 'synthetic' }).valid, false);
assert.equal(validateCase({ ...synthetic, topic: 'unknown', role: 'وکیل' }).valid, false);
assert.equal(validateCase({ ...synthetic, topic: 'theft', role: 'unknown' }).valid, false);
console.log('PASS: 24 phase-one topic-role contracts; unknown topic, role and extra field rejected');
