'use strict';
// CI wiring contract: do not mistake a committed browser test for an executed test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');

test('experimental preview branch must trigger push CI without deploy permissions', () => {
  assert.ok(workflow.includes('- dadyar/ai-chat-private-20261101'));
  assert.ok(workflow.includes("github.ref == 'refs/heads/dadyar/ai-chat-private-20261101'"));
  assert.ok(workflow.includes("github.event.pull_request.head.ref == 'dadyar/ai-chat-private-20261101'"));
  assert.ok(workflow.includes('DADYAR_PREVIEW_BRANCH: dadyar/ai-chat-private-20261101'));
  assert.ok(workflow.includes('DADYAR_PREVIEW_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'));
  assert.ok(workflow.includes('DADYAR_PREVIEW_WORKFLOW_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes('DADYAR_PREVIEW_EVENT: ${{ github.event_name }}'));
  assert.ok(workflow.includes('name: dadyar-public-preview-${{ github.event.pull_request.head.sha || github.sha }}'));
  assert.ok(!workflow.includes('dadyar-offline-preview-'), 'operator handoff must not be uploaded as a public artifact');
  assert.ok(workflow.includes('permissions:\n  contents: read'));
  assert.ok(!workflow.includes('deployments: write'));
});

test('CI must execute browser suites sequentially, outside the parallel contract batch', () => {
  assert.ok(workflow.includes('node --test "${contracts[@]}"'));
  assert.ok(workflow.includes('CHROME_BIN="$CHROME_BIN" node --test tests/dadyar-preview-mobile-chromium.test.cjs'));
  assert.ok(workflow.includes('CHROME_BIN="$CHROME_BIN" node --test tests/dadyar-preview-mobile-device-emulation.test.cjs'));
  assert.ok(workflow.includes('tests/dadyar-preview-mobile-device-emulation.test.cjs ]] || contracts+='));
  assert.ok(workflow.includes('test -n "$CHROME_BIN"'));
});

test('every active focused review base must trigger and execute pull-request CI', () => {
  const reviewBases = [
    'dadyar/replay-ledger-ci-base-20261117',
    'dadyar/signed-gate-review-base-20261117',
    'dadyar/restore-probe-review-base-20261117',
    'dadyar/preview-package-layout-review-base-20261117'
  ];
  for (const base of reviewBases) {
    assert.ok(workflow.includes(`      - ${base}`), `missing pull_request trigger for ${base}`);
    assert.ok(workflow.includes(`github.base_ref == '${base}'`), `job condition excludes ${base}`);
  }
});
