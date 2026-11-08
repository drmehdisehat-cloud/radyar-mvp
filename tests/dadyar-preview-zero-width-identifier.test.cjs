'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../dadyar-preview/index.html'),'utf8');
test('offline cheque intake strips zero-width separators between identifier digits before privacy check',()=>{
  assert.match(html,/replace\(\/\(\?<=\\d\)\[\\u200c/);
  const match=html.match(/const normalizedQuestionDigits=([^;]+);/);
  assert.ok(match,'normalization expression missing');
  const normalize=new Function('freeQuestion','return '+match[1]);
  const suspect=s=>/(?:\+?98|0)?9\d{9}(?!\d)|(?:\d[ -]?){15}\d|(?<!\d)\d{10}(?!\d)/.test(normalize(s));
  for(const value of ['۰۹۱۲‌۳۴۵‌۶۷۸۹','۱۲۳۴۵‌۶۷۸۹۰','٠٩١٢‍٣٤٥‍٦٧٨٩','0912\u20603456789']) assert.equal(suspect(value),true,value);
  assert.equal(suspect('چک فرضی با دو مدرک'),false);
  assert.match(html,/if\(hasSensitiveIdentifier\) document\.getElementById\('free-question'\)\.value=''/);
  assert.match(html,/exportEligible=conflicts\.length===0 && unresolved\.length===0/);
});
