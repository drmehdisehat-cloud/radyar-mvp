'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('canonical cheque workshop generates a human review task for each selected synthetic evidence',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../experimental/synthetic-cheque-browser.html'),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'workshop script exists');
 assert.match(script,/evidence\.map\(\(e,i\)=>/,'review tasks must derive from selected evidence');
 assert.match(script,/اصالت: تأییدنشده/);
 assert.match(script,/منشأ: بررسی‌نشده/);
 assert.match(script,/متخصص انسانی/);
 assert.match(script,/منابع قانونی: تأییدنشده/);
 assert.doesNotMatch(script,/اصالت: تأییدشده/);
});
