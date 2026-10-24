'use strict';
// Synthetic-only regression: this collects context, never determines entitlement,
// jurisdiction, enforceability, index values, or an amount payable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../flows.js'), 'utf8');
const { flows, questionsFor } = vm.runInNewContext(
  source + '\n({ flows, questionsFor })', {}, { timeout: 1000 }
);

test('cash mehrieh intake asks about death without identifying heirs', () => {
  const q = flows.mehrieh.questions;
  assert.equal(q.length, 4, 'preserve current interview navigation');
  assert.match(q[0], /سال عقد و واحد پول/);
  assert.match(q[0], /زوج در قید حیات/);
  assert.match(q[0], /سال تقریبی فوت/);
  assert.match(q[0], /اطلاعات هویتی ورثه را ننویسید/);
  assert.match(q[2], /مطالبه از ترکه/);
});

test('estate evidence remains optional and privacy-preserving', () => {
  const docs = flows.mehrieh.docs.join(' ');
  assert.match(docs, /در صورت ارتباط، گواهی فوت/);
  assert.match(docs, /حذف اطلاعات هویتی و مالی غیرضروری/);
  assert.equal(Object.hasOwn(flows.mehrieh, 'calculatedAmount'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'jurisdiction'), false);
  assert.equal(Object.hasOwn(flows.mehrieh, 'source'), false);
  assert.match(flows.mehrieh.questions[2], /هیچ نتیجه‌ای درباره مرجع صالح، محاسبه وجه رایج یا امکان بازداشت قطعی فرض نشود/);
});

test('estate-context addition preserves all four role-specific paths', () => {
  for (const role of ['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']) {
    assert.equal(questionsFor('mehrieh', role).length, 5);
  }
});
