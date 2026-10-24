'use strict';
// Documentation safety regression only; it does not certify Iranian law.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const note = fs.readFileSync(path.join(__dirname, '../docs/mehrieh-cash-source-handoff-20261025.md'), 'utf8');

test('cash-mehrieh research handoff never masquerades as verified law', () => {
  assert.match(note, /RESEARCH ONLY \/ NOT LEGALLY VERIFIED/);
  assert.match(note, /NOT authoritative originals/);
  assert.match(note, /https:\/\/qavanin\.ir\//);
  assert.match(note, /ترکه زوجه متوفی/);
  assert.match(note, /ترکه زوج متوفی/);
  assert.match(note, /Do not silently correct/);
  assert.match(note, /No index, amount, jurisdiction, enforcement path or outcome is validated/);
  assert.match(note, /qualified human reviewer/);
  assert.match(note, /No real case data/);
});
