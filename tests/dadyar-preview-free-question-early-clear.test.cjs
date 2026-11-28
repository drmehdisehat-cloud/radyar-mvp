'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const handler = html.match(/document\.getElementById\('generate'\)\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n\}\);/)?.[1];

test('free-question textarea is cleared before normalization and local topic classification', () => {
  assert.ok(handler, 'synthetic cheque generate handler must exist');
  const capture = handler.indexOf("let freeQuestion=freeQuestionField.value.trim();");
  const clear = handler.indexOf("freeQuestionField.value='';");
  const normalize = handler.indexOf("freeQuestion.normalize('NFKC')");
  const classify = handler.indexOf("classifyQuestion(freeQuestion)");

  assert.ok(capture >= 0, 'free question must be read from its field');
  assert.ok(clear > capture, 'textarea must be cleared after reading the transient value');
  assert.ok(normalize > clear, 'textarea must be cleared before identifier normalization');
  assert.ok(classify > clear, 'textarea must be cleared before multi-topic classification');
  assert.equal((handler.match(/freeQuestionField\.value='';/g) || []).length, 1,
    'the handler must have one explicit early-clear point');
});
