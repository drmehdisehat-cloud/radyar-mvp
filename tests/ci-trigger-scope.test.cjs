'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
const lines = workflow.split(/\r?\n/);
const fence = String.fromCharCode(96);

function branchesFor(event) {
  const eventLine = lines.indexOf('  ' + event + ':');
  assert.notEqual(eventLine, -1, 'event missing: ' + event);
  assert.equal(lines[eventLine + 1], '    branches:', 'branch allow-list missing for ' + event);
  const branches = [];
  for (let i = eventLine + 2; i < lines.length; i++) {
    const match = /^      - (.+)$/.exec(lines[i]);
    if (!match) break;
    branches.push(match[1].trim());
  }
  return branches;
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

  for (const branch of pushBranches) {
    assert.ok(readme.includes(fence + branch + fence), 'README omits push branch ' + branch);
  }
  for (const branch of pullRequestBranches) {
    assert.ok(readme.includes(fence + branch + fence), 'README omits pull-request target ' + branch);
  }

  assert.match(readme, /رویداد \`pull_request\` فقط برای PRهایی فعال است/);
  assert.match(workflow, /^permissions:\s*\r?\n  contents: read/m);
  assert.match(workflow, /persist-credentials: false/);

  const jobsSection = workflow.split(/^jobs:\s*$/m)[1];
  assert.ok(jobsSection, 'jobs section missing');
  const jobNames = Array.from(jobsSection.matchAll(/^  ([a-zA-Z0-9_-]+):\s*$/gm), item => item[1]);
  assert.deepEqual(jobNames, ['verify-existing-frontend'], 'unexpected job added; review deployment boundary');
  assert.doesNotMatch(jobsSection, /^      - name:.*deploy/im, 'deployment step must not enter stage-0 CI');
});
