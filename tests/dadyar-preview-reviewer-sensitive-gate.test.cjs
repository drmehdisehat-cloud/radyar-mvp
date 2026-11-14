'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart);
const script = scriptStart >= 0 && scriptEnd > scriptStart
  ? html.slice(scriptStart + '<script>'.length, scriptEnd)
  : '';

function extractFunction(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = script.match(new RegExp('function ' + escaped + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, name + ' must exist in the preview');
  return match[0];
}

test('reviewer privacy is part of the central fail-closed export permission gate', () => {
  const context = {
    reviewRecord: null,
    report: 'گزارش کاملاً ساختگی',
    exportEligible: true,
    exportAck: { checked: true },
    downloadButton: { disabled: false },
    recordReviewButton: { disabled: false },
    reviewerName: { value: '09000000000' },
    reviewDecision: { value: 'approved' },
    reviewNote: { value: 'یادداشت کاملاً ساختگی برای آزمون' }
  };
  const executable = [
    extractFunction('hasSensitiveIdentifier'),
    extractFunction('safeReviewText'),
    extractFunction('reviewerDetailsAreSafe'),
    extractFunction('updateExportPermission'),
    'updateExportPermission();'
  ].join('\n');
  vm.runInNewContext(executable, context, { timeout: 1000 });

  assert.equal(context.recordReviewButton.disabled, true,
    'a likely phone number must keep the local review button disabled');
  assert.equal(context.downloadButton.disabled, true,
    'no report may be downloadable without a safe review record');

  context.reviewerName.value = 'بازبین آزمون';
  vm.runInNewContext('updateExportPermission();', context, { timeout: 1000 });
  assert.equal(context.recordReviewButton.disabled, false,
    'safe synthetic reviewer label should remain usable');

  context.reviewNote.value = 'یادداشت با نشانی https://example.test/ ساختگی';
  vm.runInNewContext('updateExportPermission();', context, { timeout: 1000 });
  assert.equal(context.recordReviewButton.disabled, true,
    'a URL in the reviewer note must keep the review gate closed');
});
