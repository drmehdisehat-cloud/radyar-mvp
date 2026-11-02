'use strict';
// End-to-end synthetic cheque intake: actual app, flow and report scripts, no API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('cheque intake completes, exports uncertainty, supports correction and erases case', () => {
  const ids = ['startBox','questionBox','results','topic','role','story','start',
    'qTitle','qProgress','qLabel','answer','back','next','skip','cancel',
    'summary','editAnswers','reset','download'];
  class Element {
    constructor(id) {
      this.id=id; this.style={}; this.value=''; this.textContent='';
      this.disabled=false; this.children=[]; this.selectedIndex=0;
    }
    replaceChildren(...children) { this.children=children; }
    append(...children) { this.children.push(...children); }
    click() { if(this.onclick) this.onclick(); }
  }
  const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  const listeners={};
  const context=vm.createContext({
    document: {
      getElementById: id=>elements[id],
      createElement: tag=>new Element(tag),
      body: { append() {} },
    },
    window: { addEventListener: (name,fn)=>{listeners[name]=fn;} },
    alert: message=>{ throw Error('Unexpected validation alert: '+message); },
    confirm: ()=>false,
    Blob, URL, setTimeout,
  });
  for(const file of ['flows.js','app.js','export.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  }
  const $=id=>elements[id];
  $('topic').value='check'; $('role').value='وکیل';
  $('story').value='یک چک کاملاً فرضی با اختلاف درباره پرداخت جزئی و گواهی عدم پرداخت.';
  $('start').click();
  assert.match($('qProgress').textContent,/سؤال ۱/);
  // The real flow may contain additional role-specific questions.
  const count=vm.runInContext("questionsFor('check','وکیل').length",context);
  assert.ok(count>=4);
  for(let i=0;i<count;i++) {
    assert.match($('qProgress').textContent,new RegExp('سؤال '+(i+1)));
    if(i===1) $('skip').click();
    else { $('answer').value='اطلاعات ساختگی مرحله '+(i+1)+'؛ مدرک تأیید نشده است.'; $('next').click(); }
  }
  assert.equal($('results').style.display,'block');
  let report=vm.runInContext('report()',context);
  assert.match(report,/گزارش آزمایشی دادیار/);
  assert.match(report,/اطلاعات تکمیل‌نشده/);
  assert.match(report,/اعتبار حقوقی|بررسی نشده|مشاوره حقوقی/);
  assert.match(report,/نامشخص/);
  $('editAnswers').click();
  assert.equal($('questionBox').style.display,'block');
  $('answer').value='پاسخ اصلاح‌شده و کاملاً فرضی';
  $('next').click();
  report=vm.runInContext('report()',context);
  assert.match(report,/پاسخ اصلاح‌شده/);
  listeners.pagehide();
  assert.equal($('startBox').style.display,'block');
  assert.equal($('story').value,'');
  assert.equal($('summary').children.length,0);
  assert.equal(vm.runInContext('state',context),null);
});
