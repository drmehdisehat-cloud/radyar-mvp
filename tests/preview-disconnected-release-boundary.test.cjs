'use strict';
// Release boundary: the experimental bearer prototype must stay disconnected
// until an explicitly reviewed integration and authenticated staging plan exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('development server does not import or invoke experimental preview authentication', () => {
  const server = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');
  assert.doesNotMatch(server, /(?:require\s*\(|from\s+['"])[^\n]*preview-(?:auth|gate)/);
  assert.doesNotMatch(server, /\b(?:createPreviewGate|verifyPreviewBearer)\s*\(/);
});

test('CI cannot publish or deploy the experimental preview', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /^permissions:\s*\n\s*contents: read\s*$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /^\s*(?:deploy|environment|workflow_dispatch):/m);
});
