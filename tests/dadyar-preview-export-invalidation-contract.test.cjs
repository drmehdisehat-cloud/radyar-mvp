'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('editing any synthetic interview input invalidates an acknowledged export', () => {
  assert.match(html, /function invalidateDraft\(\)\s*\{/);
  const body = html.match(/function invalidateDraft\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(body, 'invalidation function must exist');
  for (const guard of ['exportEligible=false', 'exportAck.checked=false', 'updateExportPermission()', 'box.hidden=true']) {
    assert.ok(body[1].includes(guard), 'missing export revocation: ' + guard);
  }
  for (const input of [
    "role.addEventListener('change',invalidateDraft)",
    "answer.addEventListener('change',invalidateDraft)",
    "getElementById('free-question').addEventListener('input',invalidateDraft)",
    "checkbox.addEventListener('change',invalidateDraft)"
  ]) assert.ok(html.includes(input), 'missing invalidation listener: ' + input);
});

test('download requires an eligible, acknowledged draft and revokes acknowledgement', () => {
  assert.match(html, /downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked/);
  assert.match(html, /if\(!report \|\| downloadButton\.disabled\)return/);
  assert.match(html, /exportAck\.checked=false;updateExportPermission\(\);/);
});
