'use strict';
// Prevent an older review ZIP from being presented as the current branch build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const recordPath = path.join(__dirname, '../docs/public-preview-artifact-review-08a46a17-20261123.json');
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const currentHead = process.env.GITHUB_SHA || checkoutHead;

test('review artifact is explicitly stale whenever its source commit differs from the checked-out head', () => {
  assert.match(currentHead, /^[a-f0-9]{40}$/);
  assert.match(record.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(record.workflow.head_sha, record.source.commit);
  assert.equal(record.integrity_manifest.source_commit, record.source.commit);

  if (record.source.commit !== currentHead) {
    assert.ok(
      record.limitations.some(item => /not a package for any later source commit/i.test(item)),
      'an artifact from an older commit must carry an explicit stale-artifact limitation'
    );
    assert.ok(
      /pinned to source commit/i.test(record.verification_scope),
      'the verification scope must identify the exact source commit'
    );
  }
});

test('review artifact can never substitute for restore, destination, reviewer-authentication or deployment proof', () => {
  assert.equal(record.integrity_manifest.backup_restore_verified, false);
  assert.equal(record.integrity_manifest.destination_verified, false);
  assert.equal(record.integrity_manifest.reviewer_authentication, 'not-implemented');
  assert.equal(record.integrity_manifest.deployment_authorized, false);
});
