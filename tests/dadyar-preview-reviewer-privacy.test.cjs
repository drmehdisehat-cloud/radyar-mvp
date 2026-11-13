'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview inline script must exist');

function harness() {
  const listeners = new Map();
  const elements = new Map();
  const makeElement = id => ({
    id,
    value: id === 'role' ? 'وکیل' : id === 'review-decision' ? 'pending' : '',
    checked: false,
    disabled: false,
    hidden: id === 'result',
    textContent: '',
    selectedIndex: 0,
    options: [],
    addEventListener(type, handler) { listeners.set(id + ':' + type, [...(listeners.get(id + ':' + type) || []), handler]); },
    dispatchEvent(event) {
      for (const handler of listeners.get(id + ':' + event.type) || []) handler({ type: event.type, target: this });
      return true;
    },
    click() {
      if (this.disabled) return;
      for (const handler of listeners.get(id + ':click') || []) handler({ type: 'click', target: this });
    },
    contains() { return false; },
    focus() {}
  });
  const document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (['#interview select', 'fieldset input[type=checkbox]', 'fieldset input[type=checkbox]:checked'].includes(selector)) return [];
      throw new Error('Unexpected preview selector: ' + selector);
    },
    createElement() { return { href: '', download: '', click() {} }; }
  };
  const sandbox = {
    document,
    URL: { createObjectURL() { return 'blob:dadyar-test'; }, revokeObjectURL() {} },
    Blob: class {},
    setTimeout() { return 0; }
  };
  vm.runInNewContext(script + '\nglobalThis.__dadyarPrivacyTest = { hasSensitiveIdentifier, reviewerDetailsAreSafe, showReviewerPrivacyWarning, reviewerName, reviewNote, reviewDecision, exportAck, recordReviewButton, downloadButton, reviewStatus, setDraft() { report = "گزارش کاملاً ساختگی"; exportEligible = true; reviewerName.value = "بازبین آزمون"; reviewDecision.value = "approved"; reviewNote.value = "بازبینی داده ساختگی و بررسی نمونه"; exportAck.checked = true; updateExportPermission(); } };', sandbox, { timeout: 1500 });
  return sandbox.__dadyarPrivacyTest;
}

test('preview privacy detector catches common Iranian identifiers and contact details', () => {
  const h = harness();
  for (const value of [
    '۰۹۱۲۳۴۵۶۷۸۹',
    '0912 345 6789',
    'شماره ملی ۰۰۱۲۳۴۵۶۷۸',
    'شماره کارت 4111 1111 1111 1111',
    'نشانی ایمیل test@example.com',
    'شماره شبا IR 820540102680020817909002',
    'نشانی https://example.com/path',
    'وب‌سایت www.example.com'
  ]) {
    assert.equal(h.hasSensitiveIdentifier(value), true, 'sensitive value was not detected: ' + value);
  }
  for (const value of ['بازبین آزمون', 'بازبینی داده ساختگی و بررسی نمونه', 'چک و مهریه در یک سناریوی فرضی']) {
    assert.equal(h.hasSensitiveIdentifier(value), false, 'synthetic text was incorrectly blocked: ' + value);
  }
});

test('reviewer label and note cannot be approved when they contain likely sensitive identifiers', () => {
  const cases = [
    ['reviewerName', 'بازبین ۰۹۱۲۳۴۵۶۷۸۹'],
    ['reviewNote', 'بازبینی ساختگی با کد ملی ۰۰۱۲۳۴۵۶۷۸'],
    ['reviewNote', 'بازبینی ساختگی با شماره کارت 4111 1111 1111 1111'],
    ['reviewNote', 'بازبینی ساختگی با ایمیل test@example.com'],
    ['reviewNote', 'بازبینی ساختگی با پیوند https://example.com']
  ];
  for (const [field, value] of cases) {
    const h = harness();
    h.setDraft();
    h[field].value = value;
    h[field].dispatchEvent({ type: 'input' });
    assert.equal(h.recordReviewButton.disabled, true, field + ' must not accept sensitive data');
    assert.match(h.reviewStatus.textContent, /شناسه حساس/);
    h.recordReviewButton.click();
    assert.equal(h.downloadButton.disabled, true, 'sensitive reviewer metadata must not unlock export');
  }
});

test('reviewer click guard rejects sensitive values even when input events are bypassed', () => {
  const h = harness();
  h.setDraft();
  h.reviewNote.value = 'یادداشت ساختگی با شماره تماس 09123456789';
  h.recordReviewButton.click();
  assert.equal(h.recordReviewButton.disabled, true);
  assert.match(h.reviewStatus.textContent, /شناسه حساس/);
  assert.equal(h.downloadButton.disabled, true);
});

test('synthetic reviewer metadata still permits one local review action', () => {
  const h = harness();
  h.setDraft();
  assert.equal(h.recordReviewButton.disabled, false);
  h.recordReviewButton.click();
  assert.equal(h.downloadButton.disabled, false);
  assert.match(h.reviewStatus.textContent, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
});

test('inline script hash remains pinned by the strict CSP and preview stays offline', () => {
  const digest = createHash('sha256').update(script, 'utf8').digest('base64');
  assert.ok(html.includes("script-src 'sha256-" + digest + "'"), 'CSP hash must match the exact inline script bytes');
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(script, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b/);
});
