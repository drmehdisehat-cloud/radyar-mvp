'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const documentPath = path.resolve(__dirname, '../docs/IRANHOST-RESTORE-SANDBOX-REQUEST-FA.md');
const content = fs.readFileSync(documentPath, 'utf8');

test('owner handoff explicitly forbids in-place restore and protects production', () => {
  assert.match(content, /روی همان حساب تولید بازیابی نکنید/);
  assert.match(content, /خارج از `public_html`/);
  assert.match(content, /دیتابیس و کاربر MySQL مستقل/);
  assert.match(content, /DNS، فایل‌های موجود سایت/);
  assert.match(content, /Restore درجا روی حساب تولید/);
});

test('owner handoff requires real restore evidence, not archive size or hash alone', () => {
  assert.match(content, /SHA-256 آرشیو دانلودشده/);
  assert.match(content, /backup_provider: "iranhost"/);
  assert.match(content, /source_site_origin: "https:\/\/mehdisehat\.ir"/);
  assert.match(content, /backup_id/);
  assert.match(content, /archive_size_bytes/);
  assert.match(content, /exit code/);
  assert.match(content, /دو امضای Ed25519 جداگانه/);
  assert.match(content, /restore_proven` باید `false` بماند/);
  assert.match(content, /تطبیق اندازه یا هش به‌تنهایی اثبات Restore نیست/);
});

test('owner handoff keeps staging outside production and delays public publication', () => {
  assert.match(content, /خارج از Git checkout و خارج از Document Root تولید/);
  assert.match(content, /verify-preview-destination\.cjs/);
  assert.match(content, /مجوز صریح مالک/);
  assert.ok(content.includes('یک پوشه جدید `dadyar-preview` و یک فایل `index.html`'));
});

test('owner handoff does not request credentials or private keys in chat', () => {
  assert.match(content, /هیچ رمز، توکن، کلید خصوصی/);
  assert.doesNotMatch(content, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(content, /\b(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/);
});

test('IranHost handoff documents every live preview header and keeps the public folder single-file', () => {
  const checklist = fs.readFileSync(
    path.resolve(__dirname, '../docs/preview-isolated-restore-operator-checklist.md'),
    'utf8'
  );
  for (const required of [
    'must contain exactly one file, `index.html`',
    'do not add an `.htaccess` file',
    'hosting/vhost level',
    '`Content-Type: text/html; charset=utf-8`',
    '`Cache-Control: no-store`',
    '`Strict-Transport-Security: max-age=31536000`',
    '`X-Content-Type-Options: nosniff`',
    '`Content-Security-Policy`',
    "`frame-ancestors 'none'`",
    '`X-Frame-Options: DENY`',
    '`Cross-Origin-Resource-Policy: same-origin`',
    '`Permissions-Policy: camera=(), microphone=(), geolocation=()`',
    '`X-Robots-Tag: noindex, nofollow`',
    '`Referrer-Policy: no-referrer`',
    '`Content-Disposition` must be absent or exactly `inline`',
    'Do not set cookies'
  ]) {
    assert.ok(checklist.includes(required), 'missing host handoff requirement: ' + required);
  }
});

test('owner handoff confirms the actual IranHost control panel and backup format before choosing restore tooling', () => {
  assert.match(content, /صفحه ورود \[cp\.iranhost\.com\]/);
  assert.match(content, /SolidCP 1\.5\.1/);
  assert.match(content, /نوع کنترل‌پنل حساب `mehdisehat\.ir` .*اثبات نمی‌کند/);
  assert.match(content, /کنترل‌پنل متصل به همین سرویس دقیقاً cPanel است یا SolidCP/);
  assert.match(content, /فایل بکاپ ۱۴۰٫۳۸ مگابایتی دقیقاً چه قالب و نوعی دارد/);
  assert.match(content, /تا دریافت پاسخ کتبی، دستورهای مخصوص cPanel را روی پنل دیگری اجرا نکنید/);
});
