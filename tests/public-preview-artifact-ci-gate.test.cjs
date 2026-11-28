'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '../.github/workflows/public-preview-review-artifact.yml'),
  'utf8'
);
const step = name => {
  const marker = '- name: ' + name;
  const index = workflow.indexOf(marker);
  assert.notEqual(index, -1, 'missing workflow step: ' + name);
  return index;
};

test('public preview artifact workflow is branch-scoped, read-only and has no credentials', () => {
  assert.match(workflow, /^on:\s*\n  push:\s*\n    branches:\s*\n      - dadyar\/ai-chat-private-20261101\s*$/m);
  assert.match(workflow, /^permissions:\s*\n  contents: read\s*$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /actions\/checkout@f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/);
  assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /id-token:\s*write|contents:\s*write/i);
});

test('full contract and browser gates run before the public artifact is built or uploaded', () => {
  const history = step('Audit full Git history for known secret signatures');
  const contracts = step('Run every committed contract test before artifact creation');
  const releaseAudit = step('Assert unapproved release remains blocked');
  const browsers = step('Run real Chromium and mobile browser gates before artifact creation');
  const build = step('Build isolated preview handoff (not deployment)');
  const manifest = step('Create public integrity manifest (not deployment)');
  const verify = step('Verify exact public ZIP before upload (not deployment)');
  const upload = step('Upload only public HTML and integrity manifest for review (not deployment)');
  assert.ok(history < contracts && contracts < releaseAudit && releaseAudit < browsers && browsers < build && build < manifest && manifest < verify && verify < upload,
    'artifact upload must be downstream of every required verification step');
  assert.match(workflow, /tests=\(tests\/\*\.test\.cjs tests\/\*\.test\.js\)/);
  assert.match(workflow, /node --test \"\$\{contracts\[@\]\}\"/);
  for (const browserTest of [
    'tests/real-browser-smoke.cjs',
    'tests/check-intake-browser.cjs',
    'tests/synthetic-cheque-chromium-e2e.test.cjs',
    'tests/dadyar-preview-mobile-chromium.test.cjs',
    'tests/dadyar-preview-mobile-device-emulation.test.cjs',
    'tests/dadyar-preview-27-domain-routing.test.cjs'
  ]) assert.ok(workflow.includes(browserTest), 'missing browser gate: ' + browserTest);
});

test('artifact remains a two-file review handoff and never deploys or enables AI', () => {
  const verification = workflow.slice(
    step('Verify exact public ZIP before upload (not deployment)'),
    step('Upload only public HTML and integrity manifest for review (not deployment)')
  );
  assert.match(verification, /command -v zip/);
  assert.match(verification, /zip -q -X/);
  assert.match(verification, /node scripts\/verify-public-preview-artifact\.cjs/);
  assert.match(verification, /"\$GITHUB_SHA"/);
  const upload = workflow.slice(step('Upload only public HTML and integrity manifest for review (not deployment)'));
  assert.match(upload, /actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(upload, /public\/index\.html/);
  assert.match(upload, /public\/INTEGRITY\.json/);
  assert.match(upload, /if-no-files-found: error/);
  assert.match(upload, /retention-days: 7/);
  assert.doesNotMatch(upload, /\/handoff\/|\.env|restore-evidence|secrets\./i);
  assert.doesNotMatch(workflow, /actions\/deploy-pages|appleboy\/ssh-action|scp-action|rsync|\bscp\b/i);
  assert.doesNotMatch(workflow, /^\s{2}[a-z0-9_-]*deploy[a-z0-9_-]*:\s*$/im);
  assert.match(workflow, /DADYAR_PREVIEW_BRANCH: dadyar\/ai-chat-private-20261101/);
  assert.match(workflow, /DADYAR_PREVIEW_SOURCE_SHA: \$\{\{ github\.sha \}\}/);
});
