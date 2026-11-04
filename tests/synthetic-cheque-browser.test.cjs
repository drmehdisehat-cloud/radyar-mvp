'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../experimental/synthetic-cheque-browser.html'),'utf8');
function harness(){
 const handlers={};const elements={};
 const get=id=>elements[id]??=( {value:id==='role'?'وکیل':'',hidden:true,textContent:'',focus(){this.focused=true},addEventListener(name,fn){handlers[id+':'+name]=fn;}});
 const inputs=[{checked:true,dataset:{stance:'موافق'},value:'تصویر چک نمونه با شماره ساختگی',addEventListener(name,fn){handlers['evidence1:'+name]=fn;}},{checked:true,dataset:{stance:'مخالف'},value:'ادعای تسویه وجه در پرونده فرضی',addEventListener(name,fn){handlers['evidence2:'+name]=fn;}}];
 const selects=[
  {dataset:{question:'تاریخ صدور و سررسید چک چیست؟'},value:'unknown',selectedIndex:0,options:[{textContent:'نامعلوم'},{textContent:'در نمونه درج شده'},{textContent:'در نمونه درج نشده'}],addEventListener(name,fn){handlers['issue-date:'+name]=fn;}},
  {dataset:{question:'گواهی عدم پرداخت موجود است؟'},value:'unknown',selectedIndex:0,options:[{textContent:'نامعلوم'},{textContent:'در نمونه موجود است'},{textContent:'در نمونه موجود نیست'}],addEventListener(name,fn){handlers['certificate:'+name]=fn;}},
  {dataset:{question:'آیا ادعای پرداخت یا دفاع دیگری مطرح است؟'},value:'unknown',selectedIndex:0,options:[{textContent:'نامعلوم'},{textContent:'صرفاً ادعا شده است'},{textContent:'در نمونه مطرح نشده'}],addEventListener(name,fn){handlers['defense:'+name]=fn;}}
 ];
 const document={getElementById:get,querySelectorAll:selector=>selector==='#interview select'?selects:inputs,createElement:()=>({click(){}})};
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'browser code present');
 vm.runInNewContext(script,{document,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob:class{},setTimeout(){}},{timeout:1000});
 return {handlers,elements,inputs,selects,get};
}
test('offline cheque interview generates opposing-evidence review draft',()=>{
 const h=harness();h.handlers['generate:click']();
 assert.match(h.get('report').textContent,/تصویر چک نمونه/);
 assert.match(h.get('report').textContent,/ادعای تسویه/);
 assert.match(h.get('report').textContent,/گواهی عدم پرداخت/);
 assert.match(h.get('report').textContent,/منابع قانونی: تأییدنشده/);
 assert.equal(h.get('result').hidden,false);assert.equal(h.get('result').focused,true);
});
test('changing role updates simulation without official authority',()=>{
 const h=harness();h.get('role').value='قاضی';h.handlers['generate:click']();
 assert.match(h.get('report').textContent,/بدون صدور رأی/);
 assert.match(h.get('report').textContent,/متخصص انسانی/);
});
test('page has no network requests or free-text intake',()=>{
 assert.doesNotMatch(html,/<textarea\b|<input[^>]+type=["']?text|fetch\s*\(|XMLHttpRequest|WebSocket|<form\b/i);
 assert.match(html,/prefers-reduced-motion/);
 assert.match(html,/aria-live="polite"/);
});

test('changing role or synthetic evidence invalidates stale downloadable draft',()=>{
 const h=harness();h.handlers['generate:click']();
 assert.equal(h.get('result').hidden,false);
 h.get('role').value='قاضی';h.handlers['role:change']();
 assert.equal(h.get('result').hidden,true);assert.equal(h.get('report').textContent,'');
 h.handlers['generate:click']();assert.equal(h.get('result').hidden,false);
 h.inputs[0].checked=false;h.handlers['evidence1:change']();
 assert.equal(h.get('result').hidden,true);assert.equal(h.get('report').textContent,'');
});

test('interview report uses actual line breaks instead of escaped backslash-n',()=>{
 const h=harness();h.handlers['generate:click']();
 const report=h.get('report').textContent;
 assert.match(report,/وضعیت مصاحبه فرضی:\n• /);
 assert.match(report,/پرسش‌های بی‌پاسخ:\n• /);
 assert.doesNotMatch(report,/\\\\n/);
});

test('contradictory synthetic certificate and due-date evidence is explicitly flagged',()=>{
 const h=harness();
 h.inputs.push({checked:true,dataset:{stance:'موافق'},value:'گواهی عدم پرداخت نمونه'});
 h.inputs.push({checked:true,dataset:{stance:'نامعلوم'},value:'تاریخ سررسید در پرونده فرضی مشخص نیست'});
 h.selects[0].value='yes';h.selects[0].selectedIndex=1;
 h.selects[1].value='no';h.selects[1].selectedIndex=2;
 h.handlers['generate:click']();
 const report=h.get('report').textContent;
 assert.match(report,/تعارض‌های داده فرضی/);
 assert.match(report,/گواهی عدم پرداخت در فهرست مدارک انتخاب شده/);
 assert.match(report,/تاریخ سررسید نامعلوم علامت خورده/);
});

test('negative answers are recorded as absent, not mislabelled unanswered',()=>{
 const h=harness();
 h.selects[0].value='no';h.selects[0].selectedIndex=2;
 h.selects[1].value='yes';h.selects[1].selectedIndex=1;
 h.selects[2].value='yes';h.selects[2].selectedIndex=1;
 h.handlers['generate:click']();
 const report=h.get('report').textContent;
 assert.match(report,/پرسش‌های بی‌پاسخ:\nهیچ پرسش بی‌پاسخی/);
 assert.match(report,/موارد اعلام‌شده به‌عنوان ناموجود[^\n]*:\n• تاریخ صدور و سررسید چک چیست؟/);
 assert.doesNotMatch(report,/پرسش‌های بی‌پاسخ:\n• تاریخ صدور/);
});


test('contradictory interview disables export until corrected and regenerated',()=>{
 const h=harness();
 h.inputs.push({checked:true,dataset:{stance:'موافق'},value:'گواهی عدم پرداخت نمونه'});
 h.selects[1].value='no';h.selects[1].selectedIndex=2;
 h.handlers['generate:click']();
 assert.equal(h.get('result').hidden,false);
 assert.equal(h.get('download').disabled,true);
 assert.match(h.get('report').textContent,/تعارض‌های داده فرضی/);
 h.selects[1].value='yes';h.selects[1].selectedIndex=1;
 h.handlers['certificate:change']();
 assert.equal(h.get('result').hidden,true);
 assert.equal(h.get('download').disabled,true);
 h.handlers['generate:click']();
 assert.equal(h.get('download').disabled,false);
});


test('blocked export explains conflict and clears notice when inputs change',()=>{
 const h=harness();
 h.inputs.push({checked:true,dataset:{stance:'موافق'},value:'گواهی عدم پرداخت نمونه'});
 h.selects[1].value='no';h.selects[1].selectedIndex=2;
 h.handlers['generate:click']();
 assert.equal(h.get('download').disabled,true);
 assert.match(h.get('export-status').textContent,/دریافت گزارش به علت تناقض اطلاعات غیرفعال است/);
 h.handlers['certificate:change']();
 assert.equal(h.get('export-status').textContent,'');
 h.selects[1].value='yes';h.selects[1].selectedIndex=1;
 h.handlers['generate:click']();
 assert.equal(h.get('download').disabled,false);
 assert.match(h.get('export-status').textContent,/آماده دریافت/);
});
