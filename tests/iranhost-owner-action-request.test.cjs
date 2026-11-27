'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const request = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'IRANHOST-OWNER-ACTION-FA.md'),
  'utf8'
);

test('IranHost owner handoff requires account-specific panel and archive-format confirmation before restore', () => {
  for (const required of [
    'mehdisehat.ir',
    'cPanel',
    'SolidCP',
    'قالبی',
    'اندازه آن چند بایت',
    'شناسه بکاپ',
    'ابزار/نسخه',
    'Restore درجا',
    'Sandbox مستقل'
  ]) {
    assert.ok(request.includes(required), 'owner handoff must require: ' + required);
  }
});

test('owner handoff requires isolated restore evidence, not provider completion metadata', () => {
  for (const required of [
    'خارج از Document Root تولید',
    'خارج از Git checkout',
    'دیتابیس و کاربر جدا',
    'exit code',
    'sentinel',
    'SELECT 1',
    'fingerprint دیتابیس staging و production',
    'SHA-256 آرشیو',
    '۱۴۰٫۳۸ مگابایت',
    'به‌تنهایی اثبات Restore نیست'
  ]) {
    assert.ok(request.includes(required), 'restore evidence requirement missing: ' + required);
  }
});

test('owner handoff requires exact destination file validation and canonical path checks', () => {
  for (const required of [
    'dadyar-preview',
    'index.html',
    'INTEGRITY.json',
    'realpath',
    'symlink',
    'hard link',
    'SHA-256 فایل‌های مقصد',
    'همان Commit بازبینی‌شده'
  ]) {
    assert.ok(request.includes(required), 'destination validation requirement missing: ' + required);
  }
});

test('owner handoff prohibits production changes and disclosure of credentials or client data', () => {
  for (const required of [
    '`main`',
    'DNS',
    'دیتابیس تولید',
    'رمز عبور',
    'OTP',
    'کلید API',
    'کلید خصوصی',
    'داده واقعی موکل',
    'API و گفت‌وگوی هوشمند عمومی خاموش می‌مانند'
  ]) {
    assert.ok(request.includes(required), 'safety boundary missing: ' + required);
  }
});
