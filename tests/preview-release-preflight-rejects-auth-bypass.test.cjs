'use strict';

// A caller-supplied CLI boolean must never stand in for a trusted server-side
// identity-provider adapter. These negative cases run before any evidence file
// is opened and never contact a network service.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../scripts/preview-release-preflight.cjs');

test('preflight rejects caller-supplied reviewer-authentication claims', () => {
  const cases = [
    ['--trusted-reviewer-authentication-adapter-verified'],
    ['--trusted-reviewer-authentication-adapter-verified', 'true'],
    ['--authenticated-human-review-attested']
  ];

  for (const args of cases) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env }
    });

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 2, args.join(' '));
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NOT_READY');
    assert.ok(report.blockers.some(item => item.startsWith('unknown_argument:')));
    assert.equal(report.deploymentPerformed, false);
  }
});
