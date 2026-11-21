'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('root synthetic cheque page resets export on simulated role change',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../synthetic-cheque-browser.html'),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
 const nodes=Object.fromEntries(['role','generate','download','report','state'].map(id=>[id,{value:id==='role'?'وکیل':'',textContent:'',disabled:id==='download',events:{},addEventListener(event,fn){this.events[event]=fn;}}]));
 vm.runInNewContext(script,{document:{getElementById:id=>nodes[id]},Blob,URL,setTimeout},{timeout:1000});
 nodes.generate.events.click();assert.equal(nodes.download.disabled,false);assert.match(nodes.report.textContent,/نقش شبیه‌سازی: وکیل/);
 nodes.role.value='قاضی';nodes.role.events.change();assert.equal(nodes.download.disabled,true);assert.equal(nodes.report.textContent,'');
 nodes.generate.events.click();assert.equal(nodes.download.disabled,false);assert.match(nodes.report.textContent,/نقش شبیه‌سازی: قاضی/);
 assert.doesNotMatch(nodes.report.textContent,/نقش شبیه‌سازی: وکیل/);
});
