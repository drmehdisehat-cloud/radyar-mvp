'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '../backend/legal-topic-routing.cjs'), 'utf8');

function extractHints(source, declaration, label) {
  const match = source.match(new RegExp(
    declaration + '\\s*=\\s*(\\[[\\s\\S]*?\\]);\\s*function normalizeTopicText'
  ));
  assert.ok(match, label + ' taxonomy declaration missing or no longer parseable');
  return JSON.parse(match[1]);
}

function canonicalize(hints) {
  return hints
    .map(domain => ({
      id: domain.id,
      keywords: [...domain.keywords].sort()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

test('offline preview and backend keep the exact same 27 multi-topic routing hints', () => {
  const browserHints = extractHints(html, 'const topicHints', 'browser');
  const backendHints = extractHints(backend, 'const TOPIC_HINTS', 'backend');

  assert.equal(browserHints.length, 27, 'browser preview must retain all 27 topic groups');
  assert.equal(backendHints.length, 27, 'backend router must retain all 27 topic groups');
  assert.equal(new Set(browserHints.map(domain => domain.id)).size, 27, 'browser topic IDs must be unique');
  assert.equal(new Set(backendHints.map(domain => domain.id)).size, 27, 'backend topic IDs must be unique');

  for (const [label, hints] of [['browser', browserHints], ['backend', backendHints]]) {
    for (const domain of hints) {
      assert.match(domain.id, /^[a-z][a-z-]*$/, label + ' topic ID must be stable');
      assert.ok(Array.isArray(domain.keywords) && domain.keywords.length > 0,
        label + ' topic must contain keyword hints: ' + domain.id);
      assert.ok(domain.keywords.every(keyword => typeof keyword === 'string' && keyword.trim()),
        label + ' topic keywords must be non-empty strings: ' + domain.id);
    }
  }

  assert.deepEqual(
    canonicalize(browserHints),
    canonicalize(backendHints),
    'browser and backend taxonomies must not silently diverge'
  );
});

test('taxonomy parity does not turn topic hints into legal authority or a forced user category', () => {
  assert.match(html, /id="free-question"/);
  assert.match(html, /طبقه‌بندی موضوعی فقط به‌صورت محلی و چندموضوعی انجام می‌شود/);
  assert.match(backend, /Internal routing hints only\. These are not legal sources or conclusions\./);
  assert.doesNotMatch(html, /<select[^>]+(?:topic|موضوع)/i);
});
