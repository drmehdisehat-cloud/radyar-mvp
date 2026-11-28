'use strict';
// Synthetic structural coverage only. This does not validate Iranian law,
// prove privacy safety, or authorize deployment.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'flows.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { timeout: 1000 });
const data = JSON.parse(vm.runInContext(
  'JSON.stringify({ flows, roleQuestions })', context, { timeout: 1000 }
));
const topics = ['theft', 'fraud', 'debt', 'check', 'divorce', 'mehrieh'];
const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];

test('all six phase-one interview topics have distinct questions and evidence prompts', () => {
  for (const topic of topics) {
    const flow = data.flows[topic];
    assert.ok(flow, 'missing topic: ' + topic);
    assert.ok(typeof flow.title === 'string' && flow.title.trim());
    assert.ok(Array.isArray(flow.questions) && flow.questions.length >= 3, topic);
    assert.ok(Array.isArray(flow.docs) && flow.docs.length >= 2, topic);
    for (const value of [...flow.questions, ...flow.docs]) {
      assert.ok(typeof value === 'string' && value.trim().length >= 20, topic);
    }
    assert.equal(new Set(flow.questions).size, flow.questions.length, topic);
  }
});

test('all phase-one topics have a nonempty interview for each supported role', () => {
  for (const topic of topics) {
    for (const role of roles) {
      const prompt = data.roleQuestions[topic]?.[role];
      assert.ok(typeof prompt === 'string' && prompt.trim().length >= 40,
        topic + ': ' + role);
    }
  }
});

test('interview composition appends exactly the selected role prompt', () => {
  for (const topic of topics) {
    for (const role of roles) {
      context.topic = topic;
      context.role = role;
      const questions = JSON.parse(vm.runInContext(
        'JSON.stringify(questionsFor(topic, role))', context, { timeout: 1000 }
      ));
      assert.equal(questions.length, data.flows[topic].questions.length + 1);
      assert.deepEqual(questions.slice(0, -1), data.flows[topic].questions);
      assert.equal(questions.at(-1), data.roleQuestions[topic][role]);
    }
  }
});
