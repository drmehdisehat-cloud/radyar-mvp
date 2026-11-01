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
const errors = {401:'کد دسترسی درست نیست.',422:'گفتگو باید ساختگی و کوتاه باشد.',429:'سقف آزمایش رسیده است؛ بعداً تلاش کنید.',503:'سرویس هوش مصنوعی فعلاً در دسترس نیست.',502:'سرویس هوش مصنوعی پاسخ نداد؛ دوباره تلاش کنید.'};
// Map only allowlisted server error codes. Never render arbitrary provider text.
const serverErrors = Object.freeze({
  ai_not_configured:'اتصال هوش مصنوعی در این محیط پیکربندی نشده است.',
  provider_capacity_unavailable:'اعتبار یا ظرفیت سرویس هوش مصنوعی کافی نیست؛ بعداً تلاش کنید.',
  provider_unavailable:'سرویس هوش مصنوعی پاسخ نداد؛ دوباره تلاش کنید.',
  authentication_required:'کد دسترسی درست نیست.',
  preview_limit_reached:'سقف آزمایش رسیده است؛ بعداً تلاش کنید.',
  synthetic_conversation_required:'گفتگو باید ساختگی و کوتاه باشد.'
});
async function responseError(response) {
  let code;
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') code = body.error;
  } catch { /* Non-JSON errors retain a generic status message. */ }
  return Object.prototype.hasOwnProperty.call(serverErrors, code)
    ? serverErrors[code]
    : (errors[response.status] || 'خطای ارتباط با سرور.');
}
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
    if (!response.ok) throw Error(await responseError(response));
    const data = await response.json();
    if (pending !== controller) return;
    // Never present a malformed upstream payload as an AI answer.
    if (!data || typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 16000)
      throw Error('پاسخ معتبر از سرویس دریافت نشد؛ گفتگو ثبت نشد.');
    messages = [...next,{role:'assistant',content:data.answer}];
    // One interview must keep its initial legal topic; clear to switch topics.
    el('topic').disabled = true;
    render(); el('message').value='';el('status').textContent='پاسخ آزمایشی؛ پیش از اقدام واقعی با وکیل بررسی کنید.';
  } catch(error) {if(pending===controller)el('status').textContent=error.name==='AbortError'?'ارسال لغو شد.':error.message;}
  finally {if(pending===controller){pending=null;el('send').disabled=false;}}
});
function clearChat() {if(pending)pending.abort();pending=null;messages=[];el('access').value='';el('message').value='';el('consent').checked=false;el('topic').disabled=false;el('send').disabled=false;el('status').textContent='گفتگو پاک شد.';render();}
el('clear').addEventListener('click',clearChat);
window.addEventListener('pagehide',clearChat);
