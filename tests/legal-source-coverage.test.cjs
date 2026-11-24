'use strict';
// Inventory-only release audit. An official URL and a recorded link-review
// date do NOT establish the law's validity, effective date or amendments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ $: () => ({}) });
vm.runInContext(fs.readFileSync(path.join(root, 'flows.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'export.js'), 'utf8'), context);
const topics = JSON.parse(vm.runInContext(
  'JSON.stringify(Object.entries(flows).map(([id, flow]) => ({id, title:flow.title, source:flow.source || null})))',
  context
));
assert.deepEqual(topics.map(t => t.id).sort(),
  ['check', 'debt', 'divorce', 'fraud', 'mehrieh', 'theft']);
const present = [], missing = [];
for (const topic of topics) {
  assert.ok(typeof topic.title === 'string' && topic.title.trim(),
    'topic title: ' + topic.id);
  if (!topic.source) { missing.push(topic.id); continue; }
  context.candidate = topic.source;
  assert.equal(vm.runInContext('safeLawSource(candidate)', context), true,
    'unsafe or undated source-link metadata: ' + topic.id);
  present.push(topic.id);
}
assert.equal(present.length + missing.length, topics.length);
console.log('AUDIT ONLY: ' + topics.length + ' topics, ' + present.length +
  ' with safe dated source-link metadata (' + (present.join(', ') || 'none') +
  '), ' + missing.length + ' without source (' +
  (missing.join(', ') || 'none') +
  '). Legal validity/effective dates: NOT VERIFIED.');
