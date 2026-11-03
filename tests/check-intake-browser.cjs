'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<150;i++){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Browser timed out');}
test('real Chromium: synthetic cheque interview, role switch and contradiction gate',{timeout:60000},async()=>{
 assert.ok(process.env.CHROME_BIN,'Real Chromium required');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dadyar-cheque-'));
 const browser=spawn(process.env.CHROME_BIN,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws;
 try{
  const port=await wait(()=>{const f=path.join(profile,'DevToolsActivePort');return fs.existsSync(f)?Number(fs.readFileSync(f,'utf8').split('\n')[0]):null;});
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(pending.delete(n))reject(Error('CDP timeout'));},12000).unref();});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  const nav=await send('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'../check-intake.html')).href});assert.ok(!nav.errorText);
  await wait(()=>evaluate("document.readyState==='complete' && !!document.getElementById('intake')"));
  // Privacy guard must reject invisible-character obfuscation in the real page.
  const privacy=await evaluate("({email:containsSensitiveIdentifier('test.person@ex\\u200Bample.org'),mobile:containsSensitiveIdentifier('۰۹۱۲\\u200C۳۴۵۶۷۸۹'),ordinary:containsSensitiveIdentifier('پرونده کاملاً فرضی چک')})");
  assert.deepEqual(privacy,{email:true,mobile:true,ordinary:false});
  const nationalId=await evaluate("({valid:containsSensitiveIdentifier('کد فرضی ۱۲۳۴۵۶۷۸۹۱'),invalid:containsSensitiveIdentifier('کد فرضی ۱۲۳۴۵۶۷۸۹۰'),repeated:containsSensitiveIdentifier('۱۱۱۱۱۱۱۱۱۱')})");
  assert.deepEqual(nationalId,{valid:true,invalid:false,repeated:false});
  // Browser download stays in a disposable directory, never in the repository.
  const downloads=path.join(profile,'downloads');fs.mkdirSync(downloads);
  await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  const outcome=await evaluate(`(()=>{
   const f=document.getElementById('intake'),dl=document.getElementById('download'),out=document.getElementById('draft'),confirm=document.getElementById('export-confirm');
   const set=(k,v)=>{f.elements[k].value=v;f.elements[k].dispatchEvent(new Event('change',{bubbles:true}));};
   set('role','دارنده چک');set('state','برگشت خورده');set('sayad','تأیید شده');set('evidence','هر دو');set('certificate','بله');set('settlementChronology','موضوعیت ندارد');set('signature','خیر');
   f.elements.timeline.value='داستان ساختگی';let a=[...document.querySelectorAll('#role-answers textarea')];const fields=a.length===3;
   a.slice(0,2).forEach((x,i)=>x.value='پاسخ ساختگی '+i);f.requestSubmit();
   const incomplete=dl.disabled&&out.textContent.includes('تکمیل سه پاسخ');
   a[2].value='پاسخ ساختگی 2';f.requestSubmit();
   const needsConfirmation=dl.disabled&&!confirm.disabled&&out.textContent.includes('پاسخ ساختگی 0');
   confirm.click();const generated=!dl.disabled&&confirm.checked;
   set('sayad','نامعلوم');f.requestSubmit();const unverifiedBlocked=dl.disabled&&confirm.disabled&&out.textContent.includes('وضعیت صیاد');
   set('sayad','تأیید شده');f.requestSubmit();confirm.click();const restored=!dl.disabled&&confirm.checked;
   set('state','وضعیت نامعلوم');f.requestSubmit();
   const unknownStateBlocked=dl.disabled&&confirm.disabled&&out.textContent.includes('وضعیت پرداخت یا برگشت');
   set('state','برگشت خورده');set('certificate','نامعلوم');f.requestSubmit();
   const unknownCertificateBlocked=dl.disabled&&confirm.disabled&&out.textContent.includes('وجود یا نبود گواهی');
   set('certificate','بله');f.requestSubmit();confirm.click();const unknownsResolved=!dl.disabled&&confirm.checked;
   set('state','پرداخت شده');set('settlementChronology','نامعلوم یا بدون مدرک');f.requestSubmit();
   const paidAfterReturnBlocked=dl.disabled&&confirm.disabled&&out.textContent.includes('ترتیب زمانی پرداخت');
   set('settlementChronology','برگشت سپس پرداخت و تسویه مستند');f.requestSubmit();
   const documentedSettlementAllowed=dl.disabled&&!confirm.disabled&&out.textContent.includes('تسویه مستند');
   confirm.click();const documentedSettlementConfirmed=!dl.disabled&&confirm.checked;
   set('state','برگشت خورده');f.requestSubmit();confirm.click();
   const paidAfterReturnRestored=!dl.disabled&&confirm.checked;
   dl.click();
   set('role','صادرکننده چک');const invalidated=dl.disabled&&[...document.querySelectorAll('#role-answers textarea')].every(x=>!x.value);
   [...document.querySelectorAll('#role-answers textarea')].forEach((x,i)=>x.value='دفاع فرضی '+i);
   set('evidence','تصویر فرضی چک');f.requestSubmit();
   const blocked=dl.disabled&&out.textContent.includes('ناسازگاری');
   set('evidence','هر دو');f.requestSubmit();
   const awaitingReconfirmation=dl.disabled&&!confirm.disabled&&!confirm.checked&&out.textContent.includes('دفاع فرضی 0')&&!out.textContent.includes('پاسخ ساختگی 0');
   confirm.click();const recovered=!dl.disabled&&confirm.checked;
   f.reset();const cleared=dl.disabled&&f.elements.role.value==='';
   return {fields,incomplete,needsConfirmation,generated,unverifiedBlocked,restored,unknownStateBlocked,unknownCertificateBlocked,unknownsResolved,paidAfterReturnBlocked,documentedSettlementAllowed,documentedSettlementConfirmed,paidAfterReturnRestored,invalidated,blocked,awaitingReconfirmation,recovered,cleared};
  })()`);
  assert.deepEqual(outcome,{fields:true,incomplete:true,needsConfirmation:true,generated:true,unverifiedBlocked:true,restored:true,unknownStateBlocked:true,unknownCertificateBlocked:true,unknownsResolved:true,paidAfterReturnBlocked:true,documentedSettlementAllowed:true,documentedSettlementConfirmed:true,paidAfterReturnRestored:true,invalidated:true,blocked:true,awaitingReconfirmation:true,recovered:true,cleared:true});
  const downloaded=await wait(()=>{const names=fs.readdirSync(downloads);return names.find(n=>n.endsWith('.txt'))||null;});
  const content=fs.readFileSync(path.join(downloads,downloaded),'utf8');
  assert.ok(content.charCodeAt(0)===0xFEFF,'download must preserve UTF-8 BOM for Persian text');
  assert.match(content,/پاسخ فرضی:\s*\n│ پاسخ ساختگی 0/);
  assert.match(content,/پاسخ فرضی:\s*\n│ پاسخ ساختگی 2/);
  assert.doesNotMatch(content,/دفاع فرضی 0/);
 }finally{
  if(ws)ws.close();
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(r=>browser.once('exit',r)),sleep(2000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
 }
});