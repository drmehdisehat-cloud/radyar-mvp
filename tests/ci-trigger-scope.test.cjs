'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');

function branchesFor(event) {
  const escaped = event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = workflow.match(new RegExp('^  ' + escaped + ':\\s*\\r?\\n    branches:\\s*\\r?\\n((?:      - [^\\r\\n]+\\r?\\n)+)', 'm'));
  assert.ok(match, 'branch allow-list missing for ' + event);
  return match[1].split(/\\r?\\n/).filter(Boolean).map(line => line.replace(/^      - /, '').trim());
}

test('experimental CI push and pull-request scopes are explicit and documented', () => {
  const pushBranches = branchesFor('push');
  const pullRequestBranches = branchesFor('pull_request');

  assert.deepEqual(pushBranches, [
    'dadyar/mvp-sync-028',
    'dadyar/preview-auth-policy-20261030',
    'dadyar/ai-chat-private-20261101'
  ]);
  assert.deepEqual(pullRequestBranches, ['main', 'dadyar/mvp-sync-028']);

  for (const branch of pushBranches) assert.ok(readme.includes('`' + branch + '`'), 'README omits push branch ' + branch);
  for (const branch of pullRequestBranches) assert.ok(readme.includes('`' + branch + '`'), 'README omits pull-request target ' + branch);

  assert.match(readme, /رویداد `pull_request` فقط برای PRهایی فعال است/);
  assert.match(workflow, /^permissions:\\s*\\r?\\n  contents: read/m);
  assert.match(workflow, /persist-credentials: false/);

  const jobsSection = workflow.split(/^jobs:\\s*$/m)[1];
  assert.ok(jobsSection, 'jobs section missing');
  const jobNames = Array.from(jobsSection.matchAll(/^  ([a-zA-Z0-9_-]+):\\s*$/gm), item => item[1]);
  assert.deepEqual(jobNames, ['verify-existing-frontend'], 'unexpected job added; review deployment boundary');
  assert.doesNotMatch(jobsSection, /^      - name:.*deploy/im, 'deployment step must not enter stage-0 CI');
});
