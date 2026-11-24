'use strict';
// Synthetic interview-copy safety checks. These are not PII detection or legal approval.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'flows.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { timeout: 1000 });
const data = JSON.parse(vm.runInContext('JSON.stringify({ flows, roleQuestions })', context, { timeout: 1000 }));
const topics = ['theft', 'fraud', 'debt', 'check', 'divorce', 'mehrieh'];
const roles = ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد'];

test('phase-one user-facing interview copy contains no HTML elements or active URL schemes', () => {
  for (const topic of topics) {
    const flow = data.flows[topic];
    assert.ok(flow, 'missing topic ' + topic);
    const prompts = [flow.title, ...flow.questions, ...flow.docs, ...roles.map(role => data.roleQuestions[topic]?.[role])];
    for (const prompt of prompts) {
      assert.equal(typeof prompt, 'string', topic);
      assert.doesNotMatch(prompt, /<\/?[a-z][^>]*>|(?:javascript|data|vbscript):/i, topic);
      assert.doesNotMatch(prompt, /https?:\/\/\S+/i, topic);
    }
  }
});

