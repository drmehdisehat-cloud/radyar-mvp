'use strict';
const assert = require('node:assert/strict');
const { validateCase } = require('../backend/validation.js');
const valid = { topic: 'theft', role: 'شاهد', story: 'شرح آزمایشی پرونده ساختگی', answers: ['۱','۲','۳','۴','۵'] };
assert.equal(validateCase(valid).valid, true);
assert.equal(validateCase({ ...valid, topic: 'unknown' }).valid, false);
assert.equal(validateCase({ ...valid, answers: [] }).valid, false);
console.log('PASS: validator smoke test');
