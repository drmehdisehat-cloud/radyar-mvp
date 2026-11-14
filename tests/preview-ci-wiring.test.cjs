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
