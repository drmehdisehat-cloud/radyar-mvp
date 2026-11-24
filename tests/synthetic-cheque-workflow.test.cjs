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

test('each simulated professional role has distinct non-official guidance', () => {
  const guidance = new Set();
  for (const role of ['وکیل','قاضی','سردفتر','دادستان','ضابط']) {
    const result = makeDraft({...input, role});
    assert.equal(result.role, role);
    assert.ok(result.draft.startsWith(result.roleGuidance));
    assert.equal(result.publicationBlocked, true);
    assert.equal(result.humanReviewRequired, true);
    assert.deepEqual(result.legalSources, []);
    guidance.add(result.roleGuidance);
  }
  assert.equal(guidance.size, 5);
});

test('review pack tracks every synthetic evidence item without granting verification', () => {
  const result = makeDraft({...input, evidence:[
    ...input.evidence,
    {stance:'نامعلوم',description:'مدرک مبهم فرضی'}
  ]});
  assert.deepEqual(result.reviewTasks.map(t=>t.evidenceIndex),[1,2,3]);
  assert.deepEqual(result.reviewTasks.map(t=>t.side),['موافق','مخالف','نامعلوم']);
  assert.ok(result.reviewTasks.every(t=>t.verified===false && t.action.length>10));
  assert.equal(result.publicationBlocked,true);
  assert.equal(result.workflowState,'NEEDS_MORE_INFORMATION');
});

test('synthetic workflow rejects contact identifiers without echoing them in CLI output', () => {
  for (const contact of ['test@example.com', '09123456789', '+989123456789']) {
    const candidate = {...input, evidence:[{stance:'موافق',description:'فرضی ' + contact}]};
    assert.throws(() => makeDraft(candidate), /potential_personal_data/);
    const run = spawnSync(process.execPath,[cli],{input:JSON.stringify(candidate),encoding:'utf8',timeout:3000});
    assert.equal(run.status,2);
    assert.equal(run.stdout,'');
    assert.equal(run.stderr,'invalid_synthetic_input\n');
    assert.ok(!run.stderr.includes(contact));
  }
});

test('synthetic workflow rejects Persian and Arabic digit phone contacts, including separators', () => {
  for (const contact of ['۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩', '+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹', '۰۹۱۲-۳۴۵-۶۷۸۹']) {
    const candidate = {...input, evidence:[{stance:'موافق',description:'فرضی ' + contact}]};
    assert.throws(() => makeDraft(candidate), /potential_personal_data/);
    const run = spawnSync(process.execPath,[cli],{input:JSON.stringify(candidate),encoding:'utf8',timeout:3000});
    assert.equal(run.status,2);
    assert.equal(run.stdout,'');
    assert.equal(run.stderr,'invalid_synthetic_input\n');
  }
});

test('legal review checklist remains entirely unverified and publication stays blocked', () => {
  const result = makeDraft(input);
  assert.deepEqual(result.legalReviewChecklist.map(x => x.id),
    ['official_article','official_publication','effective_date','human_signoff']);
  assert.ok(result.legalReviewChecklist.every(x => x.verified === false && x.label.length > 15));
  assert.deepEqual(result.legalSources, []);
  assert.equal(result.publicationBlocked, true);
  assert.equal(result.humanReviewRequired, true);
});
