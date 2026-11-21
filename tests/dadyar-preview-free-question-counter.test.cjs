'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';

test('free-question character counter is visible, associated and starts at zero', () => {
  assert.match(html, /<textarea id="free-question" aria-describedby="free-question-scope-note free-question-counter" maxlength="300"/);
  assert.match(html, /<output id="free-question-counter" for="free-question">۰ از ۳۰۰ نویسه<\/output>/);
  assert.match(script, /freeQuestionField\.addEventListener\('input',updateFreeQuestionCounter\)/);
  assert.match(script, /document\.getElementById\('free-question'\)\.addEventListener\('input',invalidateDraft\)/);
});

// Keep the display aligned with the browser's maxlength UTF-16 code-unit behavior.
test('counter follows HTML maxlength UTF-16 code-unit semantics and uses Persian digits', () => {
  const functionSource = script.match(/function updateFreeQuestionCounter\(\)\{[^}]*\}/)?.[0];
  assert.ok(functionSource, 'counter update function must exist');
  const context = {
    freeQuestionField: { value: '' },
    freeQuestionCounter: { textContent: '' },
    formatPersianDigits(value) {
      return String(value).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
    }
  };
  vm.runInNewContext(functionSource, context, { timeout: 500 });
  vm.runInNewContext('updateFreeQuestionCounter()', context, { timeout: 500 });
  assert.equal(context.freeQuestionCounter.textContent, '۰ از ۳۰۰ نویسه');

  context.freeQuestionField.value = 'چک تضمینی';
  vm.runInNewContext('updateFreeQuestionCounter()', context, { timeout: 500 });
  assert.equal(context.freeQuestionCounter.textContent,
    String('چک تضمینی'.length).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) + ' از ۳۰۰ نویسه');

  context.freeQuestionField.value = '😀';
  vm.runInNewContext('updateFreeQuestionCounter()', context, { timeout: 500 });
  assert.equal(context.freeQuestionCounter.textContent, '۲ از ۳۰۰ نویسه');
});

test('counter resets immediately after the question is cleared for classification and on full reset', () => {
  assert.match(script, /freeQuestionField\.value='';\s*if\(typeof freeQuestionCounter!=='undefined'\) freeQuestionCounter\.textContent='۰ از ۳۰۰ نویسه';/);
  assert.match(script, /function clearInterviewState\(\)[\s\S]*?document\.getElementById\('free-question'\)\.value = '';[\s\S]*?if\(typeof freeQuestionCounter!=='undefined'\) freeQuestionCounter\.textContent='۰ از ۳۰۰ نویسه';/);
});
