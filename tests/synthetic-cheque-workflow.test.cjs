'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { makeDraft } = require('../scripts/synthetic-cheque-workflow.cjs');
const cli = path.resolve(__dirname, '../scripts/synthetic-cheque-workflow.cjs');
const input = { topic:'چک', role:'وکیل', synthetic:true, evidence:[
  {stance:'موافق',description:'تصویر چک کاملاً فرضی'},
  {stance:'مخالف',description:'ادعای پرداخت فرضی'}
]};
test('cheque workflow yields non-official opposing evidence draft and questions', () => {
  const result = makeDraft(input);
  assert.equal(result.status, 'SYNTHETIC_ONLY');
  assert.equal(result.humanReviewRequired, true);
  assert.deepEqual(result.legalSources, []);
  assert.match(result.draft, /تصویر چک کاملاً فرضی/);
  assert.match(result.draft, /ادعای پرداخت فرضی/);
  assert.match(result.draft, /گواهی عدم پرداخت/);
  assert.match(result.draft, /پیش‌نویس رأی|رأی، سند رسمی/);
});
test('CLI generates draft from stdin without API or storage', () => {
  const run = spawnSync(process.execPath, [cli], {input:JSON.stringify(input),encoding:'utf8',timeout:3000});
  assert.equal(run.status,0);
  assert.equal(JSON.parse(run.stdout).humanReviewRequired,true);
});
test('CLI fails closed for non-synthetic or other-topic inputs without echo', () => {
  for (const bad of [{...input,synthetic:false},{...input,topic:'طلاق'}]) {
    const run = spawnSync(process.execPath,[cli],{input:JSON.stringify(bad),encoding:'utf8',timeout:3000});
    assert.equal(run.status,2);
    assert.equal(run.stdout,'');
    assert.equal(run.stderr,'invalid_synthetic_input\n');
  }
});
