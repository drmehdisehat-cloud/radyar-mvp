'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline preview inline script must exist');

function harness() {
  const handlers = new Map();
  const elements = new Map();
  let exportedBlob = null;
  let exportedFilename = '';

  function makeElement(id) {
    const element = {
      id,
      value: id === 'role' ? 'وکیل' : id === 'review-decision' ? 'pending' : '',
      checked: false,
      disabled: false,
      hidden: id === 'result',
      textContent: '',
      selectedIndex: 0,
      options: [],
      addEventListener(type, callback) { handlers.set(id + ':' + type, callback); },
      dispatchEvent(event) {
        const callback = handlers.get(id + ':' + event.type);
        if (callback) callback({ type: event.type, target: this });
        return true;
      },
      click() {
        if (this.disabled) return;
        const callback = handlers.get(id + ':click');
        if (callback) callback({ type: 'click', target: this });
      },
      focus() {},
      contains() { return false; }
    };
    return element;
  }

  const get = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const selects = [
    {
      id: 'issue-date',
      question: 'تاریخ صدور و سررسید چک چیست؟',
      options: ['نامعلوم', 'در نمونه درج شده', 'در نمونه درج نشده']
    },
    {
      id: 'certificate',
      question: 'گواهی عدم پرداخت موجود است؟',
      options: ['نامعلوم', 'در نمونه موجود است', 'در نمونه موجود نیست']
    },
    {
      id: 'defense',
      question: 'آیا ادعای پرداخت یا دفاع دیگری مطرح است؟',
      options: ['نامعلوم', 'صرفاً ادعا شده است', 'در نمونه مطرح نشده']
    }
  ].map(spec => {
    const element = makeElement(spec.id);
    element.dataset = { question: spec.question };
    element.value = 'unknown';
    element.options = spec.options.map(textContent => ({ textContent }));
    return element;
  });

  const evidence = [
    { checked: true, dataset: { stance: 'موافق' }, value: 'تصویر چک نمونه با شماره ساختگی' },
    { checked: false, dataset: { stance: 'موافق' }, value: 'گواهی عدم پرداخت نمونه' },
    { checked: true, dataset: { stance: 'مخالف' }, value: 'ادعای تسویه وجه در پرونده فرضی' },
    { checked: false, dataset: { stance: 'نامعلوم' }, value: 'تاریخ سررسید در پرونده فرضی مشخص نیست' }
  ].map((spec, index) => {
    const element = makeElement('evidence-' + index);
    Object.assign(element, spec);
    return element;
  });

  const document = {
    activeElement: null,
    getElementById: get,
    querySelectorAll(selector) {
      if (selector === '#interview select') return selects;
      if (selector === 'fieldset input[type=checkbox]') return evidence;
      if (selector === 'fieldset input[type=checkbox]:checked') return evidence.filter(item => item.checked);
      throw new Error('Unexpected selector in preview test: ' + selector);
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        href: '',
        download: '',
        click() { exportedFilename = this.download; }
      };
    }
  };

  const url = {
    createObjectURL(blob) { exportedBlob = blob; return 'blob:dadyar-human-review-test'; },
    revokeObjectURL() {}
  };

  vm.runInNewContext(script, {
    document,
    URL: url,
    Blob,
    setTimeout() { return 0; }
  }, { timeout: 1500 });

  return {
    get,
    selects,
    evidence,
    get exportedBlob() { return exportedBlob; },
    get exportedFilename() { return exportedFilename; },
    clearExport() { exportedBlob = null; exportedFilename = ''; }
  };
}

function buildConsistentChequeDraft(h) {
  const values = ['yes', 'no', 'yes'];
  h.selects.forEach((select, index) => {
    select.value = values[index];
    select.selectedIndex = values[index] === 'yes' ? 1 : 2;
    select.dispatchEvent({ type: 'change' });
  });
  h.get('generate').click();
  assert.equal(h.get('result').hidden, false);
  assert.equal(h.get('download').disabled, true, 'download must remain blocked before review');
}

function fillReview(h, decision = 'approved') {
  const reviewer = h.get('reviewer-name');
  reviewer.value = 'بازبین آزمون';
  reviewer.dispatchEvent({ type: 'input' });

  const choice = h.get('review-decision');
  choice.value = decision;
  choice.dispatchEvent({ type: 'change' });

  const note = h.get('review-note');
  note.value = 'بازبینی سناریوی ساختگی و تعارض مدارک نمونه';
  note.dispatchEvent({ type: 'input' });

  const acknowledgement = h.get('export-ack');
  acknowledgement.checked = true;
  acknowledgement.dispatchEvent({ type: 'change' });
  assert.equal(h.get('record-review').disabled, false, 'complete local review should be recordable');
}

test('rejected local human review never enables report export; a fresh approval is required', () => {
  const h = harness();
  buildConsistentChequeDraft(h);
  fillReview(h, 'rejected');
  h.get('record-review').click();

  assert.equal(h.get('download').disabled, true);
  assert.match(h.get('review-status').textContent, /بازبینی رد شد/);

  h.get('review-decision').value = 'approved';
  h.get('review-decision').dispatchEvent({ type: 'change' });
  assert.equal(h.get('export-ack').checked, false, 'changing the decision must clear the previous acknowledgement');
  assert.equal(h.get('download').disabled, true);

  h.get('export-ack').checked = true;
  h.get('export-ack').dispatchEvent({ type: 'change' });
  assert.equal(h.get('record-review').disabled, false);
  h.get('record-review').click();
  assert.equal(h.get('download').disabled, false, 'only a newly recorded approval may enable export');
  assert.match(h.get('review-status').textContent, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
});

test('editing reviewer details after approval invalidates export and requires a new review', async () => {
  const h = harness();
  buildConsistentChequeDraft(h);
  fillReview(h, 'approved');
  h.get('record-review').click();
  assert.equal(h.get('download').disabled, false);

  h.get('review-note').value = 'یادداشت اصلاح‌شده پس از ثبت';
  h.get('review-note').dispatchEvent({ type: 'input' });
  assert.equal(h.get('export-ack').checked, false);
  assert.equal(h.get('download').disabled, true);
  assert.match(h.get('review-status').textContent, /اطلاعات بازبینی تغییر کرد/);

  h.get('download').click();
  assert.equal(h.exportedBlob, null, 'invalidated review must not create a downloadable Blob');

  h.clearExport();
  h.get('review-note').value = 'بازبینی مجدد سناریوی ساختگی و تعارض مدارک نمونه';
  h.get('review-note').dispatchEvent({ type: 'input' });
  h.get('export-ack').checked = true;
  h.get('export-ack').dispatchEvent({ type: 'change' });
  h.get('record-review').click();
  assert.equal(h.get('download').disabled, false);

  h.get('download').click();
  assert.ok(h.exportedBlob, 'approved report Blob should be created');
  assert.equal(h.exportedFilename, 'dadyar-synthetic-cheque.txt');
  const report = await h.exportedBlob.text();
  assert.match(report, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
  assert.match(report, /نام بازبین: بازبین آزمون/);
  assert.match(report, /نتیجه بازبینی: تأیید برای دریافت آموزشی/);
  assert.match(report, /محدودیت: این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
  assert.equal(h.get('download').disabled, true, 'approval must be consumed after one export');
  assert.equal(h.get('export-ack').checked, false);

  h.clearExport();
  h.get('download').click();
  assert.equal(h.exportedBlob, null, 'a second export must require a fresh human review');
});

test('review cannot be recorded without a meaningful reviewer name and note', () => {
  const h = harness();
  buildConsistentChequeDraft(h);
  h.get('review-decision').value = 'approved';
  h.get('review-decision').dispatchEvent({ type: 'change' });
  h.get('export-ack').checked = true;
  h.get('export-ack').dispatchEvent({ type: 'change' });
  assert.equal(h.get('record-review').disabled, true, 'blank reviewer name and note must block review');
});
