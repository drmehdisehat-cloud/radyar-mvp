'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../check-intake.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'inline interview script exists');
const source=script.match(/function containsSensitiveIdentifier\(value\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(source,'privacy guard exists');
const guard=vm.runInNewContext(source+';containsSensitiveIdentifier');
test('offline cheque privacy guard blocks identifiers and allows synthetic narrative',()=>{
 for(const value of ['۰۹۱۲۱۲۳۴۵۶۷','09121234567','test@example.org','6037991234567890','۰۹۱۲ ۱۲۳ ۴۵۶۷','۰۹۱۲-۱۲۳-۴۵۶۷','(۰۹۱۲) ۱۲۳ ۴۵۶۷','۰۰۹۸ ۹۱۲ ۱۲۳ ۴۵۶۷','۶۰۳۷ ۹۹۱۲ ۳۴۵۶ ۷۸۹۰','IR820540102680020817909002','IR82 0540 1026 8002 0817 9090 02','IR۸۲-۰۵۴۰-۱۰۲۶-۸۰۰۲-۰۸۱۷-۹۰۹۰-۰۲'])assert.equal(guard(value),true);
 for(const value of ['چک فرضی در ماه دوم ارائه شد','ماه ۱۴۰۵، مبلغ فرضی',''])assert.equal(guard(value),false);
 assert.match(script,/if\(hasIdentifiers\)\{/);
 assert.match(script,/exportConfirm\.disabled=true;download\.disabled=true/);
});
