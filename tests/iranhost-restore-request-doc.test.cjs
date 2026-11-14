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
  assert.match(content, /exit code/);
  assert.match(content, /دو امضای Ed25519 جداگانه/);
  assert.match(content, /restore_proven` باید `false` بماند/);
  assert.match(content, /تطبیق اندازه یا هش به‌تنهایی اثبات Restore نیست/);
});

test('owner handoff keeps staging destination outside production and delays public publication', () => {
  assert.match(content, /خارج از Git checkout و خارج از Document Root تولید/);
  assert.match(content, /verify-preview-destination\.cjs/);
  assert.match(content, /مجوز صریح مالک/);
  assert.match(content, /فقط یک پوشه جدید `dadyar-preview` و یک فایل `index\.html`/);
});

test('owner handoff does not request credentials or private keys in chat', () => {
  assert.match(content, /هیچ رمز، توکن، کلید خصوصی/);
  assert.doesNotMatch(content, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(content, /\b(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/);
});
