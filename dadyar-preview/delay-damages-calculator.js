'use strict';
const fs = require('node:fs');
const path = require('node:path');
const indexData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/delay-damages-index.json'), 'utf8'));

function getMonthlyIndex(year, month, data = indexData) {
  if (year !== data.year) throw new RangeError('برای این سال هنوز شاخص در همین سری داده موجود نیست.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('شماره ماه باید بین ۱ تا ۱۲ باشد.');
  const value = data.months[String(month)];
  if (!Number.isFinite(value)) throw new RangeError('شاخص این ماه در تصویر موجود نیست؛ از درون‌یابی یا حدس استفاده نمی‌شود.');
  return value;
}

function calculateDelayDamages({ principal, dueYear, dueMonth, paymentYear, paymentMonth }, data = indexData) {
  if (!Number.isSafeInteger(principal) || principal <= 0) throw new TypeError('اصل دین باید عدد صحیح مثبت و در محدوده امن باشد.');
  if (paymentYear < dueYear || (paymentYear === dueYear && paymentMonth < dueMonth)) {
    throw new RangeError('تاریخ پرداخت/محاسبه نباید پیش از تاریخ مبدأ باشد.');
  }
  const dueIndex = getMonthlyIndex(dueYear, dueMonth, data);
  const paymentIndex = getMonthlyIndex(paymentYear, paymentMonth, data);
  const amountAtPayment = Math.round(principal * paymentIndex / dueIndex);
  if (!Number.isSafeInteger(amountAtPayment)) throw new RangeError('مبلغ تعدیل‌شده از محدوده عدد صحیح امن خارج است.');
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

module.exports = { calculateDelayDamages, getMonthlyIndex, indexData };
