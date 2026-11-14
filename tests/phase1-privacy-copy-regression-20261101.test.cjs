'use strict';
// Synthetic privacy-copy regression checks, not a substitute for security review.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'flows.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { timeout: 1000 });
const flows = JSON.parse(vm.runInContext('JSON.stringify(flows)', context, { timeout: 1000 }));
const roles = JSON.parse(vm.runInContext('JSON.stringify(roleQuestions)', context, { timeout: 1000 }));
const topics = ['theft', 'fraud', 'debt', 'check', 'divorce', 'mehrieh'];

test('every phase-one topic warns against sharing identifying or financial details', () => {
  for (const topic of topics) {
    const flow = flows[topic];
    assert.ok(flow, 'missing flow: ' + topic);
    const copy = [...flow.questions, ...flow.docs].join(' ');
    assert.match(copy, /ننويسيد|ننویسید|پوشاندن|حذف اطلاعات/, topic);
    assert.match(copy, /شماره|شناسه|نشانی|کد ملی/, topic);
  }
});

test('all four role-specific prompts exist for each topic and are plain text', () => {
  for (const topic of topics) {
    for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
      const prompt = roles[topic]?.[role];
      assert.ok(typeof prompt === 'string' && prompt.trim(), topic + '/' + role);
      assert.doesNotMatch(prompt, /<script\b|javascript:|<iframe\b/i, topic + '/' + role);
    }
  }
});
