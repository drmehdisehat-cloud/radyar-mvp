'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyntheticEvidenceBrief } = require('../backend/synthetic-evidence-brief');

const topics = ['سرقت تعزیری','کلاهبرداری','چک','مطالبه وجه','طلاق','مهریه'];
test('every phase-one topic has distinct practical interview questions', () => {
  const firstQuestions = topics.map(topic => {
    const result = createSyntheticEvidenceBrief({ topic, role:'وکیل', synthetic:true, evidence:[] });
    assert.equal(result.status, 'SYNTHETIC_ONLY');
    assert.ok(result.nextQuestions.length >= 4);
    assert.deepEqual(result.legalSources, []);
    assert.equal(result.legalValidity, 'تأییدنشده');
    return result.nextQuestions[0];
  });
  assert.equal(new Set(firstQuestions).size, topics.length);
});
test('opposing evidence and unknown evidence control missing-information questions', () => {
  const input = {topic:'چک', role:'قاضی', synthetic:true, evidence:[
    {stance:'موافق',description:'چک ساختگی'},
    {stance:'مخالف',description:'دفاع ساختگی'},
    {stance:'نامعلوم',description:'اصالت فرضی نامعلوم'}]};
  const result = createSyntheticEvidenceBrief(input);
  assert.equal(result.nextQuestions.length, 3);
  assert.match(result.nextQuestions[2], /نامعلوم/);
  assert.match(result.conclusion, /هیچ نتیجه حقوقی قطعی/);
});
test('non-synthetic evidence still fails closed', () => {
  assert.throws(() => createSyntheticEvidenceBrief({topic:'چک',role:'وکیل',synthetic:false,evidence:[]}), /synthetic_scope_required/);
});
