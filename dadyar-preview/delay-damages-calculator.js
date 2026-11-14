'use strict';
const fs = require('node:fs');
const path = require('node:path');
const indexData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/delay-damages-index.json'), 'utf8'));
const INDEX_SCALE = 1000000n;

function toScaledIndex(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError('شاخص باید عدد مثبت و متناهی باشد.');
  }
  const match = /^(0|[1-9]\\d{0,11})(?:\\.(\\d{1,6}))?$/.exec(String(value));
  if (!match) throw new RangeError('دقت شاخص باید حداکثر شش رقم اعشار و بدون نمایش نمایی باشد.');
  return BigInt(match[1]) * INDEX_SCALE + BigInt((match[2] || '').padEnd(6, '0') || '0');
}

function getMonthlyIndex(year, month, data = indexData) {
  if (year !== data.year) throw new RangeError('برای این سال هنوز شاخص در همین سری داده موجود نیست.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('شماره ماه باید بین ۱ تا ۱۲ باشد.');
  const value = data.months[String(month)];
  if (!Number.isFinite(value)) throw new RangeError('شاخص این ماه در تصویر موجود نیست؛ از درون‌یابی یا حدس استفاده نمی‌شود.');
  toScaledIndex(value);
  return value;
}

function calculateDelayDamages({ principal, dueYear, dueMonth, paymentYear, paymentMonth }, data = indexData) {
  if (!Number.isSafeInteger(principal) || principal <= 0) throw new TypeError('اصل دین باید عدد صحیح مثبت و در محدوده امن باشد.');
  if (paymentYear < dueYear || (paymentYear === dueYear && paymentMonth < dueMonth)) {
    throw new RangeError('تاریخ پرداخت/محاسبه نباید پیش از تاریخ مبدأ باشد.');
  }
  const dueIndex = getMonthlyIndex(dueYear, dueMonth, data);
  const paymentIndex = getMonthlyIndex(paymentYear, paymentMonth, data);
  const dueScaled = toScaledIndex(dueIndex);
  const paymentScaled = toScaledIndex(paymentIndex);
  // Exact integer arithmetic prevents precision loss when principal × index
  // exceeds Number.MAX_SAFE_INTEGER although the final adjusted amount does not.
  // All values are non-negative, so adding half the denominator implements
  // round-half-up without floating-point intermediates.
  const rounded = (BigInt(principal) * paymentScaled + dueScaled / 2n) / dueScaled;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('مبلغ تعدیل‌شده از محدوده عدد صحیح امن خارج است.');
  }
  const amountAtPayment = Number(rounded);
  return {
    principal,
    dueIndex,
    paymentIndex,
    adjustmentFactor: paymentIndex / dueIndex,
    amountAtPayment,
    damages: amountAtPayment - principal,
    seriesType: data.seriesType,
    baseYear: data.baseYear,
    baseYearStatus: data.baseYearStatus,
    sourceStatus: data.source.status,
    warning: 'این داده‌ها از تصویر مالک رونویسی شده و هنوز با جدول رسمی تطبیق مستقل نشده‌اند؛ محاسبه فقط عددی است و شرایط یا مبدأ قانونی مطالبه را احراز نمی‌کند.'
  };
}

module.exports = { calculateDelayDamages, getMonthlyIndex, indexData, toScaledIndex };
