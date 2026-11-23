'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '../.github/workflows/public-preview-review-artifact.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function stepBlock(name) {
  const marker = '- name: ' + name;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'required workflow step is missing: ' + name);
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test('public preview upload is an exact two-file allowlist, never a directory or wildcard', () => {
  const upload = stepBlock('Upload only public HTML and integrity manifest for review (not deployment)');
  const pathBlock = upload.match(/^[ \t]+path:[ \t]*\|[ \t]*\r?\n((?:[ \t]{12,}\S[^\r\n]*\r?\n)+)/m);
  assert.ok(pathBlock, 'artifact upload path block must be explicit');

  const paths = pathBlock[1].split(/\r?\n/).filter(Boolean).map(line => line.trim());
  assert.deepEqual(paths, [
    '${{ runner.temp }}/dadyar-preview-handoff/public/index.html',
    '${{ runner.temp }}/dadyar-preview-handoff/public/INTEGRITY.json'
  ]);
  assert.ok(paths.every(item => !/[?*\[\]]/.test(item)), 'wildcards and glob syntax are forbidden');
  assert.match(upload, /if-no-files-found:[ \t]*error/);
  assert.match(upload, /retention-days:[ \t]*7/);
});

test('the exact public ZIP is verified against the triggering commit before upload', () => {
  const verify = stepBlock('Verify exact public ZIP before upload (not deployment)');
  const upload = stepBlock('Upload only public HTML and integrity manifest for review (not deployment)');
  assert.ok(workflow.indexOf(verify) < workflow.indexOf(upload), 'verification must precede artifact upload');
  assert.match(verify, /node scripts\/verify-public-preview-artifact\.cjs "\$archive" "\$GITHUB_SHA"/);
});

test('the public artifact workflow has read-only repository permissions and no secrets', () => {
  assert.match(workflow, /^permissions:\r?\n  contents: read\r?\n  checks: read\r?$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /^\s*(?:environment|deployment):/mi);
});

test('only the pinned checkout, setup-node and upload-artifact actions are permitted', () => {
  const actions = [...workflow.matchAll(/^\s+uses:\s*(\S+)/gm)].map(match => match[1]);
  assert.deepEqual(actions, [
    'actions/checkout@f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a',
    'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
    'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'
  ]);
});
