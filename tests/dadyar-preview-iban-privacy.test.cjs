'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const match = html.match(/const hasSensitiveIdentifier=([^;]+);/);
test('offline cheque preview refuses Iranian IBAN in free text', () => {
  assert.ok(match, 'preview identifier guard exists');
  const detect = new Function('freeQuestion', `
    const normalizedQuestionDigits=freeQuestion.replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06F0)).replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660)).replace(/(?<=\\d)[\\u200c\\u200d\\u200e\\u200f\\u2060\\ufeff]+(?=\\d)/g,'');
    const compactIdentifierDigits=normalizedQuestionDigits.replace(/(?<=\\d)[ \\t\\r\\n\\u00a0\\u2007\\u2009\\u202f\\-–—]+(?=\\d)/g,'');
    return ${match[1]};
  `);
  for (const candidate of [
    'IR'+'1'.repeat(24),
    'ir'+'1'.repeat(24),
    'IR'+'۱'.repeat(24),
    'IR'+'١'.repeat(24),
    'IR'+'1'.repeat(12)+' '+ '1'.repeat(12)
  ]) assert.equal(detect(candidate), true, candidate);
  assert.equal(detect('در چک فرضی چه مدارکی لازم است؟'), false);
});
