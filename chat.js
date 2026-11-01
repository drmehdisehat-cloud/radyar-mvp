'use strict';
const el = id => document.getElementById(id);
let messages = [], pending = null;
function render() {
  el('log').replaceChildren();
  for (const m of messages) {
    const box = document.createElement('article');
    box.textContent = (m.role === 'user' ? 'شما: ' : 'دادیار: ') + m.content;
    el('log').append(box);
  }
}
const errors = {401:'کد دسترسی درست نیست.',422:'گفتگو باید ساختگی و کوتاه باشد.',429:'سقف آزمایش رسیده است؛ بعداً تلاش کنید.',503:'اتصال هوش مصنوعی در این محیط پیکربندی نشده است.',502:'سرویس هوش مصنوعی پاسخ نداد؛ دوباره تلاش کنید.'};
el('send').addEventListener('click', async () => {
  if (pending) return;
  if (!el('consent').checked) {el('status').textContent='ابتدا ارسال سناریوی ساختگی به OpenAI را تأیید کنید.';return;}
  const content = el('message').value.trim();
  const token = el('access').value.trim();
  if (!content || !/^[A-Za-z0-9_-]{43}$/.test(token)) {el('status').textContent='پرسش و کد دسترسی معتبر لازم است.';return;}
  if (messages.length >= 10) {el('status').textContent='برای ادامه یک گفتگوی جدید شروع کنید.';return;}
  const next = [...messages,{role:'user',content:messages.length?content:'موضوع: '+el('topic').value+'\n'+content}];
  const controller = new AbortController(); pending = controller;
  el('send').disabled = true; el('status').textContent='دادیار در حال پاسخ است…';
  try {
    const response = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({syntheticOnly:true,messages:next}),signal:controller.signal});
    if (!response.ok) throw Error(errors[response.status] || 'خطای ارتباط با سرور.');
    const data = await response.json();
    if (pending !== controller) return;
    messages = [...next,{role:'assistant',content:data.answer}];
    render(); el('message').value='';el('status').textContent='پاسخ آزمایشی؛ پیش از اقدام واقعی با وکیل بررسی کنید.';
  } catch(error) {if(pending===controller)el('status').textContent=error.name==='AbortError'?'ارسال لغو شد.':error.message;}
  finally {if(pending===controller){pending=null;el('send').disabled=false;}}
});
function clearChat() {if(pending)pending.abort();pending=null;messages=[];el('access').value='';el('message').value='';el('consent').checked=false;el('send').disabled=false;el('status').textContent='گفتگو پاک شد.';render();}
el('clear').addEventListener('click',clearChat);
window.addEventListener('pagehide',clearChat);
