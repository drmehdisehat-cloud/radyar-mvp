'use strict';
const $=id=>document.getElementById(id);
let state=null;
// Align browser intake with the server's structural input boundary.
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\u2060\u2066-\u206F\uFEFF]/u;
const HAS_SEMANTIC_CONTENT = /[\p{L}\p{N}]/u;
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
    !UNSAFE_TEXT.test(value) && !hasUnpairedSurrogate(value);
}
function show(id){['startBox','questionBox','results'].forEach(x=>$(x).style.display=x===id?'block':'none')}
function question(){const f=flows[state.topic],qs=questionsFor(state.topic,state.role);if(state.index>=qs.length){finish();return}$('qTitle').textContent=f.title+' | سؤال تکمیلی';$('qProgress').textContent=`سؤال ${state.index+1} از ${qs.length}`;$('qLabel').textContent=qs[state.index];$('answer').value=state.answers[state.index]||'';$('back').disabled=state.index===0;show('questionBox')}
$('start').onclick=()=>{const topic=$('topic').value,role=$('role').value;if(!Object.hasOwn(flows,topic)||!Object.hasOwn(roleQuestions,topic)||!Object.hasOwn(roleQuestions[topic],role)){alert('موضوع یا نقش انتخاب‌شده معتبر نیست.');return}const rawStory=$('story').value;if(!safeCaseText(rawStory,10,5000)){alert('شرح پرونده باید حداقل ۱۰ نویسه و بدون نویسه کنترلی نامعتبر باشد.');return}const story=rawStory.trim();state={topic,role,story,index:0,answers:[]};question()};
function record(value){state.answers[state.index]=value;state.index++;question()}
$('next').onclick=()=>{const rawAnswer=$('answer').value;if(!safeCaseText(rawAnswer,1,2000)){alert('پاسخ معتبر وارد کنید (بدون نویسه کنترلی نامعتبر) یا «فعلاً نمی‌دانم» را انتخاب کنید.');return}record(rawAnswer.trim())};
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
