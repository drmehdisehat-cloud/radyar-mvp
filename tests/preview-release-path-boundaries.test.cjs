'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const {
  hasIndependentRestoreAttestation,
  hasVerifiedStagingDestination,
  pathsDisjoint
} = require('../scripts/decide-preview-release.cjs');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const checkout = path.resolve(__dirname, '..');

function restoreEvidence(overrides = {}) {
  const completed = new Date(Date.now() - 120000).toISOString();
  const reviewed = new Date(Date.now() - 60000).toISOString();
  return {
    evidence: 'independent-restore-manifest-v1',
    restore_proven: true,
    archive_sha256: sha256('synthetic archive'),
    restored_marker_sha256: sha256('synthetic marker'),
    restore_log_sha256: sha256('synthetic restore log'),
    database_probe_sha256: sha256('synthetic database probe'),
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'synthetic-isolated-target',
    restore_target_path: '/srv/dadyar-restore',
    restore_target_realpath: '/srv/dadyar-restore',
    production_document_root: '/var/www/production',
    production_document_root_realpath: '/var/www/production',
    restore_database_name: 'synthetic_staging_db',
    production_database_name: 'synthetic_production_db',
    restore_database_user: 'synthetic_staging_user',
    production_database_user: 'synthetic_production_user',
    restore_operator: 'Synthetic Operator',
    independent_reviewer: 'Synthetic Reviewer',
    restore_completed_at: completed,
    reviewed_at: reviewed,
    ...overrides
  };
}

function destinationEvidence(overrides = {}) {
  const blob = crypto.createHash('sha1').update('synthetic git blob').digest('hex');
  const digest = sha256('synthetic reviewed preview');
  return {
    matched: true,
    destination_outside_document_root: true,
    destination_outside_git_checkout: true,
    source_blob_sha1: blob,
    expected_source_blob_sha1: blob,
    source_sha256: digest,
    destination_sha256: digest,
    destination_realpath: '/srv/dadyar-staging/preview/index.html',
    production_document_root_realpath: '/var/www/production',
    git_checkout_realpath: checkout,
    ...overrides
  };
}

test('path separation rejects ancestors and descendants in both directions', () => {
  assert.equal(pathsDisjoint('/srv/restore', '/var/www/production'), true);
  assert.equal(pathsDisjoint('/var/www', '/var/www/production'), false);
  assert.equal(pathsDisjoint('/var/www/production/child', '/var/www/production'), false);
});

test('independent restore evidence rejects a restore root that contains production document root', () => {
  const evidence = restoreEvidence({
    restore_target_path: '/var/www',
    restore_target_realpath: '/var/www'
  });
  assert.equal(hasIndependentRestoreAttestation(evidence), false);
});

test('staging destination rejects an ancestor of the production document root', () => {
  const evidence = destinationEvidence({ destination_realpath: '/var/www' });
  assert.equal(hasVerifiedStagingDestination(evidence), false);
});

test('staging destination rejects an ancestor of the Git checkout', () => {
  const evidence = destinationEvidence({
    destination_realpath: path.dirname(checkout)
  });
  assert.equal(hasVerifiedStagingDestination(evidence), false);
});

test('disjoint restore and staging paths remain structurally acceptable', () => {
  assert.equal(hasIndependentRestoreAttestation(restoreEvidence()), true);
  assert.equal(hasVerifiedStagingDestination(destinationEvidence()), true);
});
