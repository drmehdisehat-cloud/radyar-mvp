'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const normalization = html.match(/const normalizedQuestionDigits=([^;]+);/);
const compaction = html.match(/const compactIdentifierDigits=([^;]+);/);
const guard = html.match(/const hasSensitiveIdentifier=([^;]+);/);
test('IR prefix with whitespace or hyphen before digits cannot bypass offline privacy gate', () => {
  assert.ok(normalization && compaction && guard, 'production privacy guard found');
  const detect = new Function('freeQuestion', 'const normalizedQuestionDigits=' + normalization[1] + ';const compactIdentifierDigits=' + compaction[1] + ';return ' + guard[1] + ';');
  for (const separator of [' ', '\\n', '\\t', '-', '\\u00a0', '\\u202f']) {
    const actual = separator === '\\n' ? '\n' : separator === '\\t' ? '\t' : separator === '\\u00a0' ? '\u00a0' : separator === '\\u202f' ? '\u202f' : separator;
    assert.equal(detect('IR' + actual + '۱'.repeat(24)), true, JSON.stringify(separator));
  }
  assert.equal(detect('IR 12345 درباره چک فرضی'), false);
  assert.equal(detect('آیا چک فرضی قابل بررسی است؟'), false);
});
