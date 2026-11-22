'use strict';
// Prevent an older review ZIP from being presented as the current branch build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const recordPath = path.join(__dirname, '../docs/public-preview-artifact-review-08a46a17-20261123.json');
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
// On pull_request events GITHUB_SHA is a synthetic merge commit. Prefer the
// explicit reviewed source SHA supplied by the preview workflow.
const currentHead = process.env.DADYAR_PREVIEW_SOURCE_SHA ||
  process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

test('review artifact is explicitly stale whenever its source commit differs from the checked-out head', () => {
  assert.match(currentHead, /^[a-f0-9]{40}$/);
  assert.match(record.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(record.workflow.head_sha, record.source.commit);
  assert.equal(record.integrity_manifest.source_commit, record.source.commit);

  if (record.source.commit !== currentHead) {
    assert.ok(
      record.limitations.some(item =>
        item.includes(record.source.commit) && /not a package for any later source commit/i.test(item)
      ),
      'an artifact from an older commit must name its exact source commit and carry an explicit stale-artifact limitation'
    );
  }
});

test('review artifact can never substitute for restore, destination, reviewer-authentication or deployment proof', () => {
  assert.equal(record.integrity_manifest.backup_restore_verified, false);
  assert.equal(record.integrity_manifest.destination_verified, false);
  assert.equal(record.integrity_manifest.reviewer_authentication, 'not-implemented');
  assert.equal(record.integrity_manifest.deployment_authorized, false);
});
