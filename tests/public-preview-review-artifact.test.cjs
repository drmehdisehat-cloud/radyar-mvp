'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildOfflinePreviewPackage } = require('../scripts/build-offline-preview-package.cjs');

const workflow = fs.readFileSync(
  path.join(__dirname, '../.github/workflows/public-preview-review-artifact.yml'),
  'utf8'
);

test('public review artifact is push-only, read-only and uploads exactly one public HTML file', () => {
  assert.match(workflow, /^on:\s*\n  push:\s*\n    branches:\s*\n      - dadyar\/ai-chat-private-20261101\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(?:pull_request|pull_request_target|workflow_dispatch|schedule):/m);
  assert.match(workflow, /^permissions:\s*\n  contents: read\s*$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/checkout@f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/);
  assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(workflow, /actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(workflow, /node scripts\/build-offline-preview-package\.cjs/);
  assert.match(workflow, /DADYAR_PREVIEW_EVENT: push/);
  assert.match(workflow, /DADYAR_PREVIEW_BRANCH: dadyar\/ai-chat-private-20261101/);

  const upload = workflow.split('      - name: Upload only public HTML for review (not deployment)')[1];
  assert.ok(upload, 'public artifact upload step missing');
  assert.match(upload, /name: dadyar-public-preview-review-\$\{\{ github\.sha \}\}/);
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/dadyar-preview-handoff\/public\/index\.html/);
  assert.match(upload, /if-no-files-found: error/);
  assert.match(upload, /retention-days: 7/);
  assert.doesNotMatch(upload, /path:.*(?:^|\/)handoff\//m);
  assert.doesNotMatch(upload, /dadyar-preview-handoff\/(?!public\/index\.html)/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /^\s*(?:id-token|contents|actions|packages): write\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(?:environment|workflow_run):/m);
  assert.doesNotMatch(workflow, /(?:scp|sftp|ftp|ssh|rsync|vercel\s+--prod|netlify\s+deploy|firebase\s+deploy|wrangler\s+deploy)/i);
});

test('package builder keeps operator handoff outside the single-file public payload', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-public-preview-review-'));
  const destination = path.join(parent, 'package');
  try {
    const result = buildOfflinePreviewPackage(destination, {
      commit: 'a'.repeat(40),
      workflowCommit: 'a'.repeat(40),
      workflowEvent: 'push',
      branch: 'dadyar/ai-chat-private-20261101'
    });
    assert.deepEqual(result.public_files, ['index.html']);
    assert.deepEqual(result.handoff_files, ['PREVIEW-METADATA.json', 'README-fa.txt', 'SHA256SUMS']);
    assert.deepEqual(fs.readdirSync(path.join(destination, 'public')), ['index.html']);

    const metadata = JSON.parse(fs.readFileSync(
      path.join(destination, 'handoff', 'PREVIEW-METADATA.json'), 'utf8'
    ));
    assert.equal(metadata.api_enabled, false);
    assert.equal(metadata.public_ai_enabled, false);
    assert.equal(metadata.backup_restore_verified, false);
    assert.equal(metadata.destination_verified, false);
    assert.equal(metadata.deployment_authorized, false);
    assert.equal(metadata.reviewer_authentication, 'not-implemented');

    const html = fs.readFileSync(path.join(destination, 'public', 'index.html'), 'utf8');
    assert.match(html, /چک فرضی/);
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /id="export-ack"/);
    assert.match(html, /id="free-question"/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
