'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview script must exist');

function harness() {
  const handlers = new Map();
  const elements = new Map();
  const downloads = [];
  const blobs = [];
  const document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) {
        const defaults = {
          role: 'وکیل',
          'review-decision': 'pending',
          'free-question': ''
        };
        const element = {
          id,
          value: defaults[id] || '',
          textContent: '',
          hidden: id === 'result',
          disabled: false,
          checked: false,
          selectedIndex: 0,
          options: [],
          addEventListener(type, callback) {
            const key = id + ':' + type;
            handlers.set(key, [...(handlers.get(key) || []), callback]);
          },
          focus() {
            document.activeElement = this;
          },
          contains(node) {
            return node === this;
          },
          click() {
            for (const callback of handlers.get(id + ':click') || []) callback();
          }
        };
        elements.set(id, element);
      }
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector === '#interview select') return selects;
      if (selector === 'fieldset input[type=checkbox]') return evidenceInputs;
      if (selector === 'fieldset input[type=checkbox]:checked') {
        return evidenceInputs.filter(input => input.checked);
      }
      throw new Error('Unsupported selector in preview test: ' + selector);
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        href: '',
        download: '',
        click() {
          downloads.push({ href: this.href, download: this.download });
        }
      };
    }
  };

  const evidenceInputs = [
    { checked: true, dataset: { stance: 'موافق' }, value: 'تصویر چک نمونه با شماره ساختگی' },
    { checked: false, dataset: { stance: 'موافق' }, value: 'گواهی عدم پرداخت نمونه' },
    { checked: true, dataset: { stance: 'مخالف' }, value: 'ادعای تسویه وجه در پرونده فرضی' },
    { checked: false, dataset: { stance: 'نامعلوم' }, value: 'تاریخ سررسید در پرونده فرضی مشخص نیست' }
  ].map((input, index) => ({
    ...input,
    addEventListener(type, callback) {
      handlers.set('evidence' + index + ':' + type, callback);
    }
  }));

  const selectSpecs = [
    ['issue-date', ['نامعلوم', 'در نمونه درج شده', 'در نمونه درج نشده']],
    ['certificate', ['نامعلوم', 'در نمونه موجود است', 'در نمونه موجود نیست']],
    ['defense', ['نامعلوم', 'صرفاً ادعا شده است', 'در نمونه مطرح نشده']]
  ];
  const selects = selectSpecs.map(([id, labels]) => ({
    id,
    dataset: { question: id },
    value: 'unknown',
    selectedIndex: 0,
    options: labels.map(textContent => ({ textContent })),
    addEventListener(type, callback) {
      handlers.set(id + ':' + type, callback);
    }
  }));

  class TestBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      blobs.push(this);
    }
  }

  vm.runInNewContext(script, {
    document,
    URL: {
      createObjectURL() { return 'blob:dadyar-test'; },
      revokeObjectURL() {}
    },
    Blob: TestBlob,
    setTimeout(callback) { callback(); }
  }, { timeout: 1000 });

  return {
    document,
    handlers,
    elements,
    evidenceInputs,
    selects,
    downloads,
    blobs,
    get: id => document.getElementById(id),
    fire(id, type) {
      const callbacks = handlers.get(id + ':' + type) || [];
      assert.ok(callbacks.length, 'missing handler ' + id + ':' + type);
      for (const callback of callbacks) callback();
    }
  };
}

function completeSyntheticInterview(h) {
  const answers = [
    ['issue-date', 'yes', 1],
    ['certificate', 'no', 2],
    ['defense', 'yes', 1]
  ];
  for (const [id, value, selectedIndex] of answers) {
    const select = h.selects.find(item => item.id === id);
    select.value = value;
    select.selectedIndex = selectedIndex;
    h.fire(id, 'change');
  }
}

function generateEligibleDraft(h) {
  completeSyntheticInterview(h);
  h.fire('generate', 'click');
  assert.equal(h.get('result').hidden, false);
  assert.equal(h.get('download').disabled, true);
  assert.match(h.get('report').textContent, /منابع قانونی: تأییدنشده/);
}

function approveLocalReview(h) {
  h.get('reviewer-name').value = 'بازبین آزمایشی';
  h.fire('reviewer-name', 'input');
  h.get('review-decision').value = 'approved';
  h.fire('review-decision', 'change');
  h.get('review-note').value = 'بررسی تعارض مدارک و محدودیت منبع';
  h.fire('review-note', 'input');
  assert.equal(h.get('record-review').disabled, true, 'review cannot be recorded before explicit acknowledgement');
  h.get('export-ack').checked = true;
  h.fire('export-ack', 'change');
  assert.equal(h.get('record-review').disabled, false);
  h.fire('record-review', 'click');
}

test('actual offline preview contains free-text intake, multi-topic hints and a hard no-network boundary', () => {
  assert.match(html, /id="free-question"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /id="review-note" minlength="12" maxlength="300" rows="2" required/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket|<form\b/i);
  assert.doesNotMatch(html, /<(?:script|link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i);
  const topicHintsSource = script.match(/const topicHints = \[([\s\S]*?)\n\];/)?.[1] || '';
  assert.equal((topicHintsSource.match(/"id"\s*:/g) || []).length, 27);
});

test('actual preview permits one report only after an approved local human-review record', () => {
  const h = harness();
  generateEligibleDraft(h);
  approveLocalReview(h);
  assert.equal(h.get('download').disabled, false);
  h.fire('download', 'click');
  assert.equal(h.downloads.length, 1);
  assert.equal(h.downloads[0].download, 'dadyar-synthetic-cheque.txt');
  assert.match(h.blobs[0].parts.join(''), /هویت احراز نشده/);
  assert.equal(h.get('download').disabled, true, 'approval must be consumed after one export');
  assert.equal(h.get('export-ack').checked, false);
});

test('review note enforces the exact twelve-character minimum before approval', () => {
  const h = harness();
  generateEligibleDraft(h);
  h.get('reviewer-name').value = 'بازبین آزمایشی';
  h.fire('reviewer-name', 'input');
  h.get('review-decision').value = 'approved';
  h.fire('review-decision', 'change');
  h.get('export-ack').checked = true;
  h.fire('export-ack', 'change');
  assert.equal(h.get('record-review').disabled, true, 'empty note must block review');
  assert.equal(h.get('download').disabled, true);

  h.get('review-note').value = '12345678901';
  h.fire('review-note', 'input');
  h.get('export-ack').checked = true;
  h.fire('export-ack', 'change');
  assert.equal(h.get('record-review').disabled, true, 'eleven characters must remain below the minimum');

  h.get('review-note').value = '123456789012';
  h.fire('review-note', 'input');
  assert.equal(h.get('export-ack').checked, false, 'editing the note must reset acknowledgement');
  h.get('export-ack').checked = true;
  h.fire('export-ack', 'change');
  assert.equal(h.get('record-review').disabled, false, 'twelve characters should satisfy the minimum');
  h.fire('record-review', 'click');
  assert.equal(h.get('download').disabled, false, 'approved review with a qualifying note should enable export');
  assert.equal(h.downloads.length, 0, 'recording review must not auto-download a report');
});

test('rejected local review never enables report download', () => {
  const h = harness();
  generateEligibleDraft(h);
  h.get('reviewer-name').value = 'بازبین آزمایشی';
  h.fire('reviewer-name', 'input');
  h.get('review-decision').value = 'rejected';
  h.fire('review-decision', 'change');
  h.get('review-note').value = 'مدرک اصلی برای تطبیق ارائه نشده است';
  h.fire('review-note', 'input');
  h.get('export-ack').checked = true;
  h.fire('export-ack', 'change');
  h.fire('record-review', 'click');
  assert.equal(h.get('download').disabled, true);
  assert.equal(h.downloads.length, 0);
});

test('changing reviewer identity, decision or note invalidates a previously approved review', () => {
  const h = harness();
  generateEligibleDraft(h);
  approveLocalReview(h);
  assert.equal(h.get('download').disabled, false);
  h.get('review-note').value = 'بازبینی دوباره لازم است';
  h.fire('review-note', 'input');
  assert.equal(h.get('download').disabled, true);
  assert.equal(h.get('export-ack').checked, false);
  assert.equal(h.downloads.length, 0);
});

test('changing case evidence invalidates the draft and any earlier review state', () => {
  const h = harness();
  generateEligibleDraft(h);
  approveLocalReview(h);
  assert.equal(h.get('download').disabled, false);
  h.evidenceInputs[0].checked = false;
  h.fire('evidence0', 'change');
  assert.equal(h.get('result').hidden, true);
  assert.equal(h.get('report').textContent, '');
  assert.equal(h.get('download').disabled, true);
  assert.equal(h.get('reviewer-name').value, '');
});

test('mixed cheque and civil free-text is classified locally without exporting raw question text', () => {
  const h = harness();
  h.get('free-question').value = 'در این سناریوی ساختگی چک و قرارداد چه مدارکی باید بررسی شود؟';
  h.fire('free-question', 'input');
  completeSyntheticInterview(h);
  h.fire('generate', 'click');
  assert.match(h.get('topic-scope-status').textContent, /چندموضوعی/);
  assert.match(h.get('report').textContent, /متن خام پرسش آزاد برای حفظ حریم خصوصی/);
  assert.doesNotMatch(h.get('report').textContent, /در این سناریوی ساختگی چک و قرارداد/);
  assert.equal(h.get('free-question').value, '');
});
