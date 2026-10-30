'use strict';
// Release-safety tripwire: preview authentication is an isolated prototype.
// This test intentionally fails if someone silently wires it to the unauthenticated
// development API or turns the local API into an internet-facing service.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

test('preview credential prototype must not be represented as deployed API auth', () => {
  assert.doesNotMatch(server, /require\s*\(\s*['"][^'"]*preview-auth['"]\s*\)/,
    'Preview auth wiring requires separate threat review and authenticated staging tests');
  assert.match(server, /127\.0\.0\.1/, 'Development server must retain loopback binding');
  assert.match(server, /deploymentModeBlocked\s*\(/,
    'Development API must fail closed in deployment environments');
});

test('experimental CI must not deploy or receive repository write permissions', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read\b/);
  assert.doesNotMatch(workflow, /^\s*(?:deploy|deployment|publish):\s*$/m);
  assert.doesNotMatch(workflow, /\b(?:contents|actions|packages):\s*write\b/);
  assert.match(workflow, /node --test tests\/\*\.test\.cjs/,
    'Contract tests, including this tripwire, must remain in CI');
});
