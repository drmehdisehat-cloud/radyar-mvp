'use strict';
// Synthetic-only guard against invisible bidirectional controls in legal intake copy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'flows.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { timeout: 1000 });
const flows = JSON.parse(vm.runInContext('JSON.stringify(flows)', context, { timeout: 1000 }));
const roleQuestions = JSON.parse(vm.runInContext('JSON.stringify(roleQuestions)', context, { timeout: 1000 }));
const topics = ['theft', 'fraud', 'debt', 'check', 'divorce', 'mehrieh'];
// These invisible controls can visually reorder case references and legal numbers.
// Ordinary Persian text does not require explicit bidi overrides or isolates.
const forbidden = /[\u202a-\u202e\u2066-\u2069\u200e\u200f]/u;

test('phase-one interview copy contains no invisible bidi control characters', () => {
  for (const topic of topics) {
    const flow = flows[topic];
    assert.ok(flow, 'missing topic: ' + topic);
    for (const [field, items] of [['questions', flow.questions], ['docs', flow.docs]]) {
      assert.ok(Array.isArray(items), topic + '/' + field);
      for (const [index, value] of items.entries()) {
        assert.equal(typeof value, 'string', topic + '/' + field + '/' + index);
        assert.doesNotMatch(value, forbidden, topic + '/' + field + '/' + index);
      }
    }
    for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
      const value = roleQuestions[topic]?.[role];
      assert.equal(typeof value, 'string', topic + '/' + role);
      assert.doesNotMatch(value, forbidden, topic + '/' + role);
    }
  }
});
