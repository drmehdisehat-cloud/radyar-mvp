'use strict';
// Phase-1 research planning only. These entries are NOT approved legal sources.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '../docs/phase1-legal-research-candidates.json');
const inventory = JSON.parse(fs.readFileSync(file, 'utf8'));
const expected = ['check', 'debt', 'divorce', 'fraud', 'mehrieh', 'theft'];

test('research inventory covers each phase-1 topic exactly once', () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.match(inventory.purpose, /research-only/);
  assert.equal(inventory.officialResearchPortal, 'https://qavanin.ir/');
  assert.deepEqual(inventory.topics.map(t => t.id).sort(), expected);
  for (const item of inventory.topics) {
    assert.ok(Array.isArray(item.candidateActs) && item.candidateActs.length > 0,
      item.id + ': candidate instruments');
    assert.ok(item.candidateActs.every(x => typeof x === 'string' && x.trim().length > 0));
    assert.ok(Array.isArray(item.reviewQuestions) && item.reviewQuestions.length >= 2,
      item.id + ': outstanding legal questions');
    assert.ok(item.reviewQuestions.every(x => typeof x === 'string' && x.trim().length > 0));
  }
});

test('candidate instruments cannot be mistaken for verified legal citations', () => {
  assert.match(inventory.note, /No official text/);
  for (const item of inventory.topics) {
    assert.equal(item.status, 'needs-official-verification', item.id);
    for (const key of ['officialTextUrl', 'effectiveDate', 'amendmentsCheckedAt', 'humanReviewer']) {
      assert.equal(item[key], null, item.id + ': ' + key + ' must remain unverified');
    }
  }
});
