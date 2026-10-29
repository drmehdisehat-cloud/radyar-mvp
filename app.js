'use strict';
const $=id=>document.getElementById(id);
let state=null;
// Align browser intake with the server's structural input boundary.
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\u2060\u2066-\u206F\uFEFF]/u;
const HAS_SEMANTIC_CONTENT = /[\p{L}\p{N}]/u;
// Best-effort privacy guard: block likely full 16-digit payment-card numbers.
// Luhn + exact 16-digit counting handles uneven grouping without partial 20-digit matches.
 // This is not comprehensive PII detection or a substitute for redaction.
const CARD_CANDIDATE = /(?<![0-9۰-۹٠-٩])(?<![0-9۰-۹٠-٩][ \t\u00A0\u202F\u2009\u2010-\u2013-]+)[0-9۰-۹٠-٩](?:[ \t\u00A0\u202F\u2009\u2010-\u2013-]*[0-9۰-۹٠-٩]){15}(?![0-9۰-۹٠-٩]|[ \t\u00A0\u202F\u2009\u2010-\u2013-]+[0-9۰-۹٠-٩])/gu;
function hasLikelyPaymentCardNumber(value) {
  for (const match of value.matchAll(CARD_CANDIDATE)) {
    const digits = match[0]
      .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
      .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[ \t\u00A0\u202F\u2009\u2010-\u2013-]/g, '');
    let checksum = 0;
    for (let index = digits.length - 1, double = false; index >= 0; index--, double = !double) {
      let digit = digits.charCodeAt(index) - 48;
      if (double) { digit *= 2; if (digit > 9) digit -= 9; }
      checksum += digit;
    }
    if (checksum % 10 === 0) return true;
  }
  return false;
}

function hasUnpairedSurrogate(value) {
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point >= 0xD800 && point <= 0xDFFF) return true;
  }
  return false;
}
function safeCaseText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min &&
    value.length <= max && HAS_SEMANTIC_CONTENT.test(value) &&
    !UNSAFE_TEXT.test(value) && !hasUnpairedSurrogate(value) &&
    !hasLikelyPaymentCardNumber(value);
}
function show(id){['startBox','questionBox','results'].forEach(x=>$(x).style.display=x===id?'block':'none')}
function question(){const f=flows[state.topic],qs=questionsFor(state.topic,state.role);if(state.index>=qs.length){finish();return}$('qTitle').textContent=f.title+' | سؤال تکمیلی';$('qProgress').textContent=`سؤال ${state.index+1} از ${qs.length}`;$('qLabel').textContent=qs[state.index];$('answer').value=state.answers[state.index]||'';$('back').disabled=state.index===0;show('questionBox')}
$('start').onclick=()=>{const topic=$('topic').value,role=$('role').value;if(!Object.hasOwn(flows,topic)||!Object.hasOwn(roleQuestions,topic)||!Object.hasOwn(roleQuestions[topic],role)){alert('موضوع یا نقش انتخاب‌شده معتبر نیست.');return}const rawStory=$('story').value;if(!safeCaseText(rawStory,10,5000)){alert('شرح پرونده باید حداقل ۱۰ نویسه باشد؛ شماره کامل کارت بانکی یا نویسه کنترلی نامعتبر وارد نکنید.');return}const story=rawStory.trim();state={topic,role,story,index:0,answers:[]};question()};
function record(value){state.answers[state.index]=value;state.index++;question()}
$('next').onclick=()=>{const rawAnswer=$('answer').value;if(!safeCaseText(rawAnswer,1,2000)){alert('پاسخ معتبر و بدون شماره کامل کارت بانکی یا نویسه کنترلی نامعتبر وارد کنید؛ یا «فعلاً نمی‌دانم» را انتخاب کنید.');return}record(rawAnswer.trim())};
$('skip').onclick=()=>record('نامشخص');
$('back').onclick=()=>{if(state&&state.index>0){state.index--;question()}};
function clearCase(){state=null;$('topic').selectedIndex=0;$('role').selectedIndex=0;$('story').value='';$('answer').value='';$('summary').replaceChildren();$('qLabel').textContent='';$('qTitle').textContent='';$('qProgress').textContent='';show('startBox')}
$('editAnswers').onclick=()=>{if(!state)return;state.index=0;question()};
$('reset').onclick=clearCase;
$('cancel').onclick=clearCase;
// A browser may preserve a page in the back-forward cache (BFCache).
// Erase the case before navigation and again if a cached page is restored.
window.addEventListener('pagehide',clearCase);
// Browsers may restore textarea values on a normal reload as well as BFCache Back.
// Clear on every pageshow, not only when event.persisted is true.
window.addEventListener('pageshow',clearCase);
