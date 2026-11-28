'use strict';
// Regression guard: historical credential scan must run on full Git history.
// This is a CI wiring test, not proof that any repository history is clean.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8'
);

test('review CI audits complete Git history and cannot ignore audit failures', () => {
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /fetch-depth:\s*0\b/);
  const auditStep = workflow.indexOf(
    '- name: Audit full Git history for known secret signatures'
  );
  const auditCommand = workflow.indexOf('run: node scripts/audit-git-history.cjs');
  const contracts = workflow.indexOf('- name: Run every committed contract test');
  assert.ok(auditStep >= 0, 'missing history-audit step');
  assert.ok(auditCommand > auditStep && auditCommand < contracts,
    'history audit must execute before contract tests');
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});
