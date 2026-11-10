'use strict';
// CI wiring contract: do not mistake a committed browser test for an executed test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
test('experimental preview branch must trigger push CI without deploy permissions', () => {
  assert.match(workflow, /^\s+- dadyar\/ai-chat-private-20261101\s*$/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/dadyar\/ai-chat-private-20261101'/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /^\s*deployments:\s*write\s*$/m);
});
test('CI must execute real Chromium mobile preview test and contract suite', () => {
  assert.match(workflow, /node --test "\$\{contracts\[@\]\}"/);
  assert.match(workflow, /CHROME_BIN="\$CHROME_BIN" node --test tests\/dadyar-preview-mobile-chromium\.test\.cjs/);\n  assert.match(workflow, /CHROME_BIN="\$CHROME_BIN" node --test tests\/dadyar-preview-mobile-device-emulation\.test\.cjs/);\n  assert.match(workflow, /tests\/dadyar-preview-mobile-device-emulation\.test\.cjs \\\]\\] \\|\\| contracts/);
  assert.match(workflow, /test -n "\$CHROME_BIN"/);
});
