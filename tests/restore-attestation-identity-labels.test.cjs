'use strict';
// Structural regression only: labels are audit metadata, not proof of real-world identity.
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasIndependentRestoreAttestation } = require('../scripts/decide-preview-release.cjs');

function fixture() {
  return {
    restore_proven: true,
    evidence: 'independent-restore-manifest-v1',
    archive_sha256: 'a'.repeat(64),
    restored_marker_sha256: 'b'.repeat(64),
    restore_log_sha256: 'c'.repeat(64),
    database_probe_sha256: 'd'.repeat(64),
    restore_exit_code: 0,
    restore_target_isolated: true,
    production_database_untouched: true,
    database_probe_passed: true,
    outbound_integrations_disabled: true,
    reviewer_attested: true,
    restore_target_id: 'synthetic-restore-target-01',
    restore_operator: 'اپراتور میزبان',
    independent_reviewer: 'بازبین مستقل',
    restore_database_name: 'radyar_restore',
    production_database_name: 'radyar_live',
    restore_database_user: 'radyar_restore_user',
    production_database_user: 'radyar_live_user',
    restore_target_path: '/srv/isolated/radyar-restore',
    restore_target_realpath: '/srv/isolated/radyar-restore',
    production_document_root: '/home/site/public_html',
    production_document_root_realpath: '/home/site/public_html',
    restore_completed_at: '2026-11-24T10:00:00.000Z',
    reviewed_at: '2026-11-24T11:00:00.000Z'
  };
}

test('accepts Persian audit labels including a legitimate ZWNJ', () => {
  const evidence = fixture();
  evidence.restore_operator = 'اپراتور‌میزبان';
  assert.equal(hasIndependentRestoreAttestation(evidence), true);
});

test('rejects zero-width, control, and bidi override characters in identity labels', () => {
  for (const hidden of ['\u200b', '\u202e', '\u000a', '\u061c', '\ufeff']) {
    const evidence = fixture();
    evidence.restore_operator = 'اپراتور' + hidden + 'میزبان';
    assert.equal(hasIndependentRestoreAttestation(evidence), false);
  }
});

test('rejects reviewer labels that differ only by an invisible joiner', () => {
  const evidence = fixture();
  evidence.restore_operator = 'اپراتور‌میزبان';
  evidence.independent_reviewer = 'اپراتورمیزبان';
  assert.equal(hasIndependentRestoreAttestation(evidence), false);
});

test('rejects hidden formatting characters in database and target audit identifiers', () => {
  for (const key of ['restore_target_id', 'restore_database_name', 'production_database_user']) {
    const evidence = fixture();
    evidence[key] = 'synthetic\u200bidentifier';
    assert.equal(hasIndependentRestoreAttestation(evidence), false);
  }
});

test('continues to reject blank or surrounding-whitespace identity labels', () => {
  for (const value of ['', '  reviewer', 'operator  ']) {
    const evidence = fixture();
    evidence.independent_reviewer = value;
    assert.equal(hasIndependentRestoreAttestation(evidence), false);
  }
});
