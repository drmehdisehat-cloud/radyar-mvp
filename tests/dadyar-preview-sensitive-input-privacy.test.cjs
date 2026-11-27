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
