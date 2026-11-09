'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const expression = html.match(/const normalizedQuestionDigits=(.*);/);
assert.ok(expression, 'preview must normalize question digits');
const marks = '\u200c\u200d\u200e\u200f\u2060\ufeff';

test('repeated invisible marks between digits cannot conceal a synthetic ten-digit identifier', () => {
  for (const mark of marks) {
    const sample = '۱۲۳' + mark.repeat(3) + '۴۵۶۷۸۹۰';
    const normalized = vm.runInNewContext(expression[1], {freeQuestion: sample});
    assert.match(normalized, /1234567890/, 'mark U+' + mark.codePointAt(0).toString(16));
  }
});

test('mixed invisible marks between digits cannot conceal a synthetic identifier', () => {
  const sample = '123' + marks + '4567890';
  const normalized = vm.runInNewContext(expression[1], {freeQuestion: sample});
  assert.match(normalized, /1234567890/);
});
