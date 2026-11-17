'use strict';
// Keep the operator guide synchronized with the actual release-preflight CLI.
// This is a documentation contract only; it never handles real reviewer data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'docs/HUMAN-REVIEW-ATTESTATION.md'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'scripts/preview-release-preflight.cjs'), 'utf8');
const httpAdapter = fs.readFileSync(path.join(root, 'backend/review-release-http-handler.cjs'), 'utf8');
const devServer = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const replayLedger = fs.readFileSync(path.join(root, 'backend/human-review-replay-ledger.cjs'), 'utf8');

const valueFlags = [
  '--restore-evidence', '--restore-archive', '--restore-marker', '--restore-log',
  '--restore-database-probe', '--restore-operator-public-key', '--restore-operator-signature',
  '--restore-reviewer-public-key', '--restore-reviewer-signature',
  '--expected-restore-operator-public-key-sha256', '--expected-restore-reviewer-public-key-sha256',
  '--destination-evidence', '--preview-source', '--preview-destination',
  '--production-document-root', '--expected-source-blob-sha1', '--review-attestation',
  '--review-trust-store', '--expected-source-commit', '--expected-artifact-sha256',
  '--expected-review-trust-store-sha256'
];
const booleanFlags = [
  '--isolated-restore-verified', '--mobile-browser-verified',
  '--zero-api-requests-verified', '--local-human-review-acknowledged'
];

test('human-review guide lists the current read-only preflight options', () => {
  for (const flag of [...valueFlags, ...booleanFlags]) {
    assert.ok(guide.includes(flag), 'guide is missing current CLI option ' + flag);
    assert.ok(cli.includes(flag), 'CLI no longer recognizes documented option ' + flag);
  }
  assert.match(guide, /گزینه‌های قدیمی[\s\S]*?معتبر نیستند/);
  assert.doesNotMatch(cli, /--human-review-verified|--authenticated-human-review-attested/);
  assert.match(cli, /const FLAG_NAMES = new Set\([\s\S]*?--local-human-review-acknowledged/);
});

test('local preview acknowledgement is explicitly not authenticated identity', () => {
  assert.match(guide, /فقط اعلام می‌کند چک‌باکس بازبینی محلی[\s\S]*?احراز هویت یا امضای بازبین نیست/);
  assert.match(httpAdapter, /not wired into backend\/server\.js/);
  assert.match(devServer, /loopback-only/);
});

test('guide describes the replay ledger as a local prototype, not a public identity service', () => {
  assert.match(replayLedger, /Single-host, local-filesystem anti-replay prototype/);
  assert.match(guide, /نمونه ضدبازپخش مبتنی بر فایل‌سیستم محلی و تک‌میزبانه/);
  assert.match(guide, /هیچ‌یک از این اجزا در وضعیت فعلی مجوز فعال‌سازی API عمومی/);
});
