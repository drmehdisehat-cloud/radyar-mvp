'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDelayDamages, getMonthlyIndex } = require('../dadyar-preview/delay-damages-calculator');

test('loads the seven transcribed 1405 monthly indices exactly', () => {
  assert.deepEqual([1,2,3,4,5,6,7].map(m => getMonthlyIndex(1405,m)), [2654.9,2880.4,3092.3,3205.1,3333.9,3452.1,3611.1]);
});

test('calculates principal adjustment using payment index divided by due index', () => {
  const result = calculateDelayDamages({ principal: 100000000, dueYear: 1405, dueMonth: 1, paymentYear: 1405, paymentMonth: 7 });
  assert.equal(result.amountAtPayment, Math.round(100000000 * 3611.1 / 2654.9));
  assert.equal(result.damages, result.amountAtPayment - 100000000);
  assert.equal(result.sourceStatus, 'transcribed-not-independently-authenticated');
});

test('fails closed for missing future months and unsupported years', () => {
  assert.throws(() => getMonthlyIndex(1405,8), /شاخص این ماه/);
  assert.throws(() => getMonthlyIndex(1404,12), /برای این سال/);
});

test('rejects invalid principal, month and decreasing index ratio', () => {
  assert.throws(() => calculateDelayDamages({principal:0,dueYear:1405,dueMonth:1,paymentYear:1405,paymentMonth:7}), /اصل دین/);
  assert.throws(() => getMonthlyIndex(1405,13), /شماره ماه/);
  assert.throws(() => calculateDelayDamages({principal:1,dueYear:1405,dueMonth:7,paymentYear:1405,paymentMonth:1}), /شاخص ماه پرداخت/);
});
