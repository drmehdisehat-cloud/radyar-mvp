'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createSyntheticEvidenceBrief} = require('../backend/synthetic-evidence-brief');
test('five simulated roles organize synthetic opposing evidence without legal authority', () => {
 for (const role of ['وکیل','قاضی','سردفتر','دادستان','ضابط']) {
  const result = createSyntheticEvidenceBrief({topic:'چک',role,synthetic:true,evidence:[
   {stance:'موافق',description:'تصویر ساختگی چک'},
   {stance:'مخالف',description:'ادعای فرضی تسویه'},
   {stance:'نامعلوم',description:'اصالت تصویر بررسی نشده'}]});
  assert.equal(result.forClaim.length,1);
  assert.equal(result.againstClaim.length,1);
  assert.equal(result.unresolved.length,1);
  assert.deepEqual(result.legalSources,[]);
  assert.match(result.review,/بازبینی متخصص انسانی/);
 }
});
test('rejects real-mode input and unsupported topics',()=>{
 const x={topic:'چک',role:'وکیل',evidence:[]};
 assert.throws(()=>createSyntheticEvidenceBrief(x),/synthetic_scope_required/);
 assert.throws(()=>createSyntheticEvidenceBrief({...x,synthetic:true,topic:'قتل'}),/synthetic_scope_required/);
});
test('rejects malformed and multiline evidence',()=>{
 const x={topic:'مهریه',role:'قاضی',synthetic:true};
 assert.throws(()=>createSyntheticEvidenceBrief({...x,evidence:[{stance:'موافق',description:'الف\nب'}]}),/invalid_evidence/);
 assert.throws(()=>createSyntheticEvidenceBrief({...x,evidence:[{stance:'قطعی',description:'الف'}]}),/invalid_evidence/);
});
test('empty synthetic evidence reports missing opposing positions',()=>{
 const result=createSyntheticEvidenceBrief({topic:'طلاق',role:'قاضی',synthetic:true,evidence:[]});
 assert.equal(result.gaps.length,3);
 assert.match(result.conclusion,/هیچ نتیجه حقوقی قطعی/);
});
