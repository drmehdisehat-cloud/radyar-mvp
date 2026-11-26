'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'dadyar-preview-slice.yml'), 'utf8');

test('review artifact build, upload, download and round-trip verification are push-only', () => {
  const build = workflow.indexOf('- name: Build and verify public-only review artifact');
  const upload = workflow.indexOf('- name: Upload review artifact only; never deploy');
  const download = workflow.indexOf('- name: Download uploaded artifact for round-trip verification');
  const verify = workflow.indexOf('- name: Verify uploaded artifact bytes and release boundary');
  assert.ok(build >= 0 && upload > build && download > upload && verify > download, 'artifact stages must run in build-upload-download-verify order');
  for (const position of [build, upload, download, verify]) {
    const step = workflow.slice(position, workflow.indexOf('\n      - name:', position + 1) < 0 ? workflow.length : workflow.indexOf('\n      - name:', position + 1));
    assert.ok(step.includes("if: github.event_name == 'push'"), 'every artifact stage must be push-only');
  }
  assert.ok(workflow.includes('id: upload-preview'));
  assert.ok(workflow.includes('uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333'));
  assert.ok(workflow.includes('artifact-ids: ${{ steps.upload-preview.outputs.artifact-id }}'));
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
});

test('artifact source SHA is the push commit SHA, not a pull-request merge SHA', () => {
  assert.ok(workflow.includes('DADYAR_PREVIEW_SOURCE_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes('GITHUB_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes('name: dadyar-preview-review-${{ github.sha }}'));
  assert.equal(workflow.includes('pull_request.head.sha'), false);
});
