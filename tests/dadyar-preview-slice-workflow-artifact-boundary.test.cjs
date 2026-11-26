'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'dadyar-preview-slice.yml'), 'utf8');

test('review artifact build and upload are push-only, never pull-request merge artifacts', () => {
  const build = workflow.match(/- name: Build and verify public-only review artifact([\\s\\S]*?)(?=\\n      - name:|$)/);
  const upload = workflow.match(/- name: Upload review artifact only; never deploy([\\s\\S]*?)(?=\\n      - name:|$)/);
  assert.ok(build, 'artifact build step exists');
  assert.ok(upload, 'artifact upload step exists');
  assert.match(build[1], /if: github\\.event_name == 'push'/);
  assert.match(upload[1], /if: github\\.event_name == 'push'/);
  assert.doesNotMatch(upload[1], /deploy|scp|sftp|ssh/i);
});

test('artifact source SHA is the push commit SHA, not the pull request head or merge SHA', () => {
  assert.match(workflow, /DADYAR_PREVIEW_SOURCE_SHA: \\$\\{\\{ github\\.sha \\}\\}/);
  assert.match(workflow, /name: dadyar-preview-review-\\$\\{\\{ github\\.sha \\}\\}/);
  assert.doesNotMatch(workflow, /pull_request\\.head\\.sha/);
});
