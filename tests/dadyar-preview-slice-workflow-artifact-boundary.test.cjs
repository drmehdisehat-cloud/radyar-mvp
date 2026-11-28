'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'dadyar-preview-slice.yml'), 'utf8');

test('review artifact is built and browser-tested on every event; upload and round-trip remain push-only', () => {
  const build = workflow.indexOf('- name: Build and verify public-only review artifact');
  const upload = workflow.indexOf('- name: Upload review artifact only; never deploy');
  const download = workflow.indexOf('- name: Download uploaded artifact by exact ID after upload job completes');
  const verify = workflow.indexOf('- name: Verify uploaded artifact bytes and release boundary');
  assert.ok(build >= 0 && upload > build && download > upload && verify > download, 'artifact stages must run in build-upload-download-verify order');
  const nextStep = position => workflow.indexOf('\n      - name:', position + 1) < 0 ? workflow.length : workflow.indexOf('\n      - name:', position + 1);
  const buildStep = workflow.slice(build, nextStep(build));
  const browserStepStart = workflow.indexOf('- name: Exercise the exact packaged artifact in real mobile Chromium');
  assert.ok(browserStepStart > build && browserStepStart < upload, 'artifact browser test must run after build and before upload');
  const browserStep = workflow.slice(browserStepStart, nextStep(browserStepStart));
  assert.equal(buildStep.includes("if: github.event_name == 'push'"), false, 'PRs must build a temporary package for testing');
  assert.equal(browserStep.includes("if: github.event_name == 'push'"), false, 'PRs must browser-test the temporary package');
  for (const position of [upload, download, verify]) {
    const step = workflow.slice(position, nextStep(position));
    assert.ok(step.includes("if: github.event_name == 'push'"), 'upload and round-trip must remain push-only');
  }
  assert.ok(workflow.includes('id: upload-preview'));
  assert.ok(workflow.includes('uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333'));
  assert.ok(workflow.includes('outputs:\n      artifact-id: ${{ steps.upload-preview.outputs.artifact-id }}'));
  assert.ok(workflow.includes('roundtrip-verify:\n    if: github.event_name == \'push\'\n    needs: verify-and-package'));
  assert.ok(workflow.includes('artifact-ids: ${{ needs.verify-and-package.outputs.artifact-id }}'));
  assert.ok(workflow.includes('github-token: ${{ github.token }}'));
  assert.ok(workflow.includes('repository: ${{ github.repository }}'));
  assert.ok(workflow.includes('run-id: ${{ github.run_id }}'));
  assert.ok(workflow.includes('name: dadyar-preview-review-${{ github.sha }}'));
  assert.ok(workflow.includes('path: ${{ runner.temp }}/dadyar-preview-roundtrip/'));
  const downloadStep = workflow.slice(download, verify);
  assert.equal(downloadStep.includes('name: dadyar-preview-review-${{ github.sha }}'), false, 'download must use the exact upload artifact ID, not a second name lookup');
  assert.ok(workflow.includes('node scripts/verify-uploaded-preview-artifact.cjs "$RUNNER_TEMP/dadyar-preview-roundtrip"'));
  assert.ok(workflow.includes('permissions:\n  contents: read\n  actions: read'));
  assert.equal(workflow.includes('deploy:'), false);
  assert.ok(workflow.includes('tests/probe-preview-staging-http.test.cjs'), 'read-only HTTPS staging probe contract must run in CI');
});

test('artifact manifest binds the exact event checkout SHA; only push artifacts are upload-eligible', () => {
  assert.ok(workflow.includes('DADYAR_PREVIEW_SOURCE_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes('GITHUB_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes('name: dadyar-preview-review-${{ github.sha }}'));
  assert.equal(workflow.includes('pull_request.head.sha'), false);
  const build = workflow.indexOf('- name: Build and verify public-only review artifact');
  const upload = workflow.indexOf('- name: Upload review artifact only; never deploy');
  const buildStep = workflow.slice(build, workflow.indexOf('\n      - name:', build + 1));
  const uploadStep = workflow.slice(upload, workflow.indexOf('\n      - name:', upload + 1));
  assert.equal(buildStep.includes("if: github.event_name == 'push'"), false);
  assert.ok(uploadStep.includes("if: github.event_name == 'push'"));
});

test('push artifact trigger is limited to the isolated review branch and read-only workflow capabilities', () => {
  const trigger = workflow.slice(0, workflow.indexOf('\npermissions:'));
  assert.equal(trigger, [
    'name: Dadyar isolated preview slice',
    'on:',
    '  push:',
    '    branches:',
    '      - dadyar/preview-review-slice-20261126',
    '      - dadyar/preview-slice-squash-20261128',
    '  pull_request:',
    '    branches:',
    '      - main'
  ].join('\n'), 'only the dedicated review branch may create a push artifact; PR checks target main');

  assert.equal(workflow.includes('workflow_dispatch:'), false, 'manual dispatch is not part of the reviewed release path');
  assert.equal(workflow.includes('schedule:'), false, 'scheduled execution must not create public artifacts');
  assert.equal(workflow.includes('repository_dispatch:'), false);
  assert.equal(workflow.includes('workflow_run:'), false);
  assert.equal(workflow.includes('workflow_call:'), false);
  assert.ok(workflow.includes('permissions:\n  contents: read\n  actions: read'));
  assert.equal(/\$\{\{\s*secrets\./i.test(workflow), false, 'the offline preview workflow must not consume repository secrets');
  assert.equal(/^\s*environment\s*:/im.test(workflow), false, 'the review workflow must not bind a deployment environment');
  assert.equal(/^\s*deploy(?:ment)?\s*:/im.test(workflow), false, 'the review workflow must not define a deployment job');

  const actionLines = workflow.split('\n').filter(line => /^\s*uses:\s/.test(line));
  assert.ok(actionLines.length >= 3, 'expected the pinned checkout, setup-node, upload and download actions');
  for (const line of actionLines) {
    assert.match(line.trim(), /^uses:\s+[^@\s]+@[a-f0-9]{40}$/, 'every third-party action must be pinned to a full commit SHA');
  }
});
