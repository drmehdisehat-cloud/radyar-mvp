const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {createChatHandler}=require('../backend/ai-handler');
test('chat HTTP: fail closed auth, consent, successful private answer and daily cap',async t=>{
  const token=randomBytes(32).toString('base64url'); let calls=0;
  const handler=createChatHandler({env:{DADYAR_PREVIEW_TOKEN:token,OPENAI_API_KEY:'test-only'},answer:async()=>{calls++;return {answer:'پرسش تکمیلی'};}});
  const server=http.createServer((req,res)=>handler(req,(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}));
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const url='http://127.0.0.1:'+server.address().port+'/api/chat';
  const sample={syntheticOnly:true,messages:[{role:'user',content:'مثال ساختگی چک'}]};
  async function request(auth,payload=sample){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(payload)});}
  assert.equal((await request()).status,401);assert.equal(calls,0);
  assert.equal((await request(token,{...sample,syntheticOnly:false})).status,422);assert.equal(calls,0);
  const response=await request(token);assert.equal(response.status,200);assert.equal((await response.json()).answer,'پرسش تکمیلی');
  for(let i=1;i<30;i++)assert.equal((await request(token)).status,200);
  assert.equal((await request(token)).status,429);assert.equal(calls,30);
});
