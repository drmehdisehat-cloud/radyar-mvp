'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'dadyar-preview-slice.yml'), 'utf8');

test('review artifact build and upload are push-only, never pull-request merge artifacts', () => {
  assert.ok(workflow.includes("- name: Build and verify public-only review artifact\n        if: github.event_name == 'push'"));
  assert.ok(workflow.includes("- name: Upload review artifact only; never deploy\n        if: github.event_name == 'push'"));
  assert.ok(workflow.includes("permissions:\n  contents: read\n  actions: read"));
  assert.equal(workflow.includes('deploy:'), false);
});

test('artifact source SHA is the push commit SHA, not the pull request head or merge SHA', () => {
  assert.ok(workflow.includes('DADYAR_PREVIEW_SOURCE_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes('name: dadyar-preview-review-${{ github.sha }}'));
  assert.equal(workflow.includes('pull_request.head.sha'), false);
});
