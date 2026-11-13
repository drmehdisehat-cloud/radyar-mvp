'use strict';
const fs = require('node:fs');
const path = require('node:path');
const indexData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/delay-damages-index.json'), 'utf8'));

function calculateDelayDamages({ principal, dueYear, dueMonth, paymentYear, paymentMonth }) {
  if (!Number.isFinite(principal) || principal <= 0) throw new TypeError('اصل دین باید عددی مثبت باشد.');
  const dueIndex = getMonthlyIndex(dueYear, dueMonth);
  const paymentIndex = getMonthlyIndex(paymentYear, paymentMonth);
  if (paymentIndex < dueIndex) throw new RangeError('شاخص ماه پرداخت نباید کمتر از شاخص ماه سررسید باشد.');
  return {
    principal,
    dueIndex,
    paymentIndex,
    adjustmentFactor: paymentIndex / dueIndex,
    amountAtPayment: Math.round(principal * paymentIndex / dueIndex),
    damages: Math.round(principal * (paymentIndex / dueIndex - 1)),
    sourceStatus: indexData.source.status,
    warning: 'این محاسبه فقط با داده‌های تصویریِ هنوز تأییدنشده سال ۱۴۰۵ انجام شده و جایگزین شاخص رسمی تأییدشده یا بررسی حقوقی نیست.'
  };
}

function getMonthlyIndex(year, month) {
  if (year !== indexData.year) throw new RangeError('برای این سال هنوز شاخص معتبر در این مجموعه داده موجود نیست.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('شماره ماه باید بین ۱ تا ۱۲ باشد.');
  const value = indexData.months[month];
  if (!Number.isFinite(value)) throw new RangeError('شاخص این ماه در تصویر موجود نیست؛ از درون‌یابی یا حدس استفاده نمی‌شود.');
  return value;
}

module.exports = { calculateDelayDamages, getMonthlyIndex };
