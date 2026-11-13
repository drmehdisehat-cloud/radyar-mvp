'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDelayDamages, getMonthlyIndex, indexData } = require('../dadyar-preview/delay-damages-calculator');

test('loads the seven 1405 values transcribed from the owner image exactly', () => {
  assert.deepEqual([1,2,3,4,5,6,7].map(m => getMonthlyIndex(1405,m)), [2654.9,2880.4,3092.3,3205.1,3333.9,3452.1,3611.1]);
  assert.equal(indexData.seriesType, 'annual-index-published-monthly');
  assert.equal(indexData.baseYear, 1395);
  assert.equal(indexData.baseYearStatus, 'inferred-from-1395-average-100-in-owner-image; not-independently-verified');
  assert.equal(indexData.source.status, 'transcribed-not-independently-authenticated');
});

test('calculates payment-month index divided by legal-origin-month index', () => {
  const result = calculateDelayDamages({ principal: 100000000, dueYear: 1405, dueMonth: 1, paymentYear: 1405, paymentMonth: 7 });
  assert.equal(result.amountAtPayment, 136016422);
  assert.equal(result.damages, 36016422);
  assert.equal(result.sourceStatus, 'transcribed-not-independently-authenticated');
});

test('does not mislabel the annual index published monthly as monthly inflation', () => {
  assert.equal(indexData.seriesType, 'annual-index-published-monthly');
  assert.equal(indexData.unit, 'index-point');
});

test('fails closed for unavailable months and unsupported years', () => {
  assert.throws(() => getMonthlyIndex(1405,8), /شاخص این ماه/);
  assert.throws(() => getMonthlyIndex(1404,12), /برای این سال/);
});

test('rejects invalid principal, invalid month and payment before legal origin', () => {
  assert.throws(() => calculateDelayDamages({principal:0,dueYear:1405,dueMonth:1,paymentYear:1405,paymentMonth:7}), /اصل دین/);
  assert.throws(() => getMonthlyIndex(1405,13), /شماره ماه/);
  assert.throws(() => calculateDelayDamages({principal:1,dueYear:1405,dueMonth:7,paymentYear:1405,paymentMonth:1}), /تاریخ پرداخت/);
});

test('does not reject a lower later index as an invalid calculation', () => {
  const falling = {
    ...indexData,
    months: { "1": 100, "2": 90 },
    source: { status: 'synthetic-test-only' }
  };
  const result = calculateDelayDamages({ principal: 1000, dueYear: 1405, dueMonth: 1, paymentYear: 1405, paymentMonth: 2 }, falling);
  assert.equal(result.amountAtPayment, 900);
  assert.equal(result.damages, -100);
});
