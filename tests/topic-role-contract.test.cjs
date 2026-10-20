'use strict';
// Synthetic-only regression guard: phase-one topics and role coverage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'flows.js'), 'utf8');
const { flows, roleQuestions, questionsFor } = vm.runInNewContext(source + '\n({ flows, roleQuestions, questionsFor })');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const topicSelect = html.match(/<select\s+id="topic"[^>]*>([\s\S]*?)<\/select>/);
assert.ok(topicSelect, 'Missing topic selector');
const uiTopics = [...topicSelect[1].matchAll(/<option\s+value="([^"]+)"/g)].map(match => match[1]);
const expected = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];
assert.deepEqual([...uiTopics].sort(), [...expected].sort(), 'UI topic options differ from phase-one contract');
assert.equal(new Set(uiTopics).size, expected.length, 'Duplicate UI topic');
assert.deepEqual(Object.keys(flows).sort(), [...expected].sort(), 'Interview topic drift');
assert.deepEqual(Object.keys(roleQuestions).sort(), [...expected].sort(), 'Role topic drift');
for (const topic of expected) {
  assert.equal(flows[topic].questions.length, 4, 'Four base questions required for ' + topic);
  assert.ok(flows[topic].docs.length >= 3, 'Evidence guidance missing for ' + topic);
  assert.deepEqual(Object.keys(roleQuestions[topic]).sort(), [...roles].sort(), 'Role coverage missing for ' + topic);
  for (const role of roles) {
    const questions = questionsFor(topic, role);
    assert.equal(questions.length, 5, 'Five questions required for ' + topic + '/' + role);
    assert.ok(questions.every(q => typeof q === 'string' && q.trim().length > 10), 'Empty question');
  }
}
console.log('PASS: six topics and four roles agree across HTML and interview engine (24 synthetic paths)');
