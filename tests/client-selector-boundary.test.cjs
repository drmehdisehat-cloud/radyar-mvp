'use strict';
// Synthetic-only browser regression: tampered select values must not crash intake.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ids = ['startBox','questionBox','results','start','story','topic','role','qTitle','qProgress','qLabel','answer','back','next','skip','editAnswers','reset','cancel','summary'];
const nodes = Object.fromEntries(ids.map(id => [id, {value:'',textContent:'',style:{display:''},disabled:false,replaceChildren(){}}]));
const warnings=[];
const ctx = vm.createContext({
  document:{getElementById:id=>nodes[id]},
  window:{addEventListener(){}},
  alert:message=>warnings.push(message),
});
for (const name of ['flows.js','app.js']) vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx);
nodes.story.value='شرح ساختگی پرونده برای آزمون';
const invalid = [
  ['__proto__','شاهد'],
  ['constructor','شاهد'],
  ['unknown','شاهد'],
  ['theft','__proto__'],
  ['theft','constructor'],
  ['theft','نقش نامعتبر'],
];
for (const [topic,role] of invalid) {
  nodes.topic.value=topic;
  nodes.role.value=role;
  const previous=warnings.length;
  assert.doesNotThrow(()=>nodes.start.onclick(),'Unexpected crash: '+topic+'/'+role);
  assert.equal(warnings.length,previous+1,'Missing warning: '+topic+'/'+role);
  assert.equal(vm.runInContext('state',ctx),null,'Invalid state created: '+topic+'/'+role);
}
nodes.topic.value='theft';
nodes.role.value='شاهد';
assert.doesNotThrow(()=>nodes.start.onclick());
assert.equal(vm.runInContext('state.topic',ctx),'theft');
assert.equal(vm.runInContext('state.role',ctx),'شاهد');
assert.equal(nodes.questionBox.style.display,'block');
nodes.answer.value='پاسخ ساختگی \u202e نامعتبر';
const before=warnings.length;
nodes.next.onclick();
assert.equal(warnings.length,before+1,'Bidi override must be rejected');
assert.equal(vm.runInContext('state.index',ctx),0,'Invalid answer advanced interview');
console.log('PASS: 6 tampered selector cases, 1 valid intake, 1 bidi override rejection');
