'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptMatch = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
assert.ok(scriptMatch, 'offline preview must keep its inline script');
const scannerMatch = scriptMatch[1].match(/^function hasSensitiveIdentifier\(value\) \{[\s\S]*?^\}/m);
assert.ok(scannerMatch, 'shared sensitive-identifier scanner must remain present');

const sandbox = {};
vm.runInNewContext(scannerMatch[0] + '\nthis.scan = hasSensitiveIdentifier;', sandbox);
const scan = sandbox.scan;

test('privacy scanner catches Persian mobile digits separated by default-ignorable characters', () => {
  const digits = '۰۹۱۲۳۴۵۶۷۸۹';
  const obfuscated = Array.from(digits).join('\u200b');
  assert.equal(scan(obfuscated), true);
});

test('privacy scanner catches Arabic-Indic mobile digits separated by punctuation', () => {
  assert.equal(scan('٠٩١٢-٣٤٥-٦٧٨٩'), true);
});

test('privacy scanner catches an email after zero-width formatting characters are removed', () => {
  assert.equal(scan('client\u200b@example.com'), true);
});

test('privacy scanner catches a URL split by a zero-width character', () => {
  assert.equal(scan('https:\u200b//example.test/path'), true);
});

test('privacy scanner catches an obfuscated synthetic Iranian IBAN', () => {
  const iban = 'IR' + '123456789012345678901234';
  assert.equal(scan('IR\u200f' + Array.from(iban.slice(2)).join('\u2060')), true);
});

test('privacy scanner catches address-like free text', () => {
  assert.equal(scan('نشانی: خیابان نمونه پلاک ۱۲'), true);
});

test('privacy scanner does not classify an ordinary legal question as an identifier', () => {
  assert.equal(scan('ماده ۵۲۲ قانون صدور چک و تاریخ واقعه ۱۴۰۵/۰۹/۰۳'), false);
});

test('privacy scanner catches a mixed Persian and Arabic-Indic 16-digit card number split by invisible marks and separators', () => {
  const card = '۶۰۳٧۹۹۱۲۳۴۵۶۷۸۹۰';
  const obfuscated = Array.from(card).map((digit, index) => index % 2 ? digit + '\u2060' : digit).join(' ');
  assert.equal(scan(obfuscated), true);
});

test('privacy scanner catches a 10-digit national identifier after Unicode formatting is removed', () => {
  const nationalId = '۰۰۱۲۳۴۵۶۷۸';
  const obfuscated = Array.from(nationalId).join('\u200b-');
  assert.equal(scan(obfuscated), true);
});

test('reviewer name and note both use the shared sensitive-identifier guard before review recording', () => {
  const reviewerGuard = scriptMatch[1].match(/^function reviewerDetailsAreSafe\(\) \{[\s\S]*?^\}/m);
  assert.ok(reviewerGuard, 'reviewer privacy guard must remain explicit');
  assert.match(reviewerGuard[0], /hasSensitiveIdentifier\(safeReviewText\(reviewerName\.value,80\)\)/);
  assert.match(reviewerGuard[0], /hasSensitiveIdentifier\(safeReviewText\(reviewNote\.value,300\)\)/);
  assert.match(scriptMatch[1], /recordReviewButton\.addEventListener\('click',async\(\)=>\{[\s\S]*?if\(!reviewerDetailsAreSafe\(\)\)/);
});

test('privacy scanner blocks context-labeled bank accounts and Iranian landlines without blocking unlabeled case references', () => {
  const blocked = [
    'شماره حساب: ۱۲۳۴۵۶۷۸۹۰۱۲۳۴',
    'شماره حساب بانکی: ۱۲۳۴-۵۶۷۸-۹۰۱۲-۳۴',
    'شماره حساب بانکی: ۱۲۳۴\\u200b۵۶۷۸\\u2060۹۰۱۲۳۴',
    'Account number: 12345678901234',
    'تلفن ثابت منزل: ۰۲۱-۱۲۳۴۵۶۷۸',
    'کد پستی: ۱۲۳۴۵۶۷۸۹۰'
  ];
  for (const probe of blocked) {
    assert.equal(scan(probe), true, 'labeled contact/bank data must be rejected: ' + probe);
  }
  assert.equal(scan('شماره پرونده: ۱۲۳۴۵۶۷۸۹۰۱۲۳۴'), false);
  assert.equal(scan('مبلغ فرضی ۱۲۳۴۵۶۷۸۹۰۱۲۳۴ ریال در دعوای چک'), false);
});
