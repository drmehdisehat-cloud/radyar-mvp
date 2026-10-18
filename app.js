'use strict';
const $=id=>document.getElementById(id);
let state=null;
function show(id){['startBox','questionBox','results'].forEach(x=>$(x).style.display=x===id?'block':'none')}
function question(){const f=flows[state.topic],qs=questionsFor(state.topic,state.role);if(state.index>=qs.length){finish();return}$('qTitle').textContent=f.title+' | سؤال تکمیلی';$('qProgress').textContent=`سؤال ${state.index+1} از ${qs.length}`;$('qLabel').textContent=qs[state.index];$('answer').value=state.answers[state.index]||'';$('back').disabled=state.index===0;show('questionBox')}
$('start').onclick=()=>{const story=$('story').value.trim();if(story.length<10){alert('لطفاً شرحی با حداقل ۱۰ نویسه وارد کنید.');return}state={topic:$('topic').value,role:$('role').value,story,index:0,answers:[]};question()};
function record(value){state.answers[state.index]=value;state.index++;question()}
$('next').onclick=()=>{const value=$('answer').value.trim();if(!value){alert('پاسخ را وارد کنید یا «فعلاً نمی‌دانم» را انتخاب کنید.');return}record(value)};
$('skip').onclick=()=>record('نامشخص');
$('back').onclick=()=>{if(state&&state.index>0){state.index--;question()}};
function clearCase(){state=null;$('story').value='';$('answer').value='';$('summary').replaceChildren();$('qLabel').textContent='';$('qTitle').textContent='';$('qProgress').textContent='';show('startBox')}
$('editAnswers').onclick=()=>{if(!state)return;state.index=0;question()};
$('reset').onclick=clearCase;
$('cancel').onclick=clearCase;
// A browser may preserve a page in the back-forward cache (BFCache).
// Erase the case before navigation and again if a cached page is restored.
window.addEventListener('pagehide',clearCase);
window.addEventListener('pageshow',event=>{if(event.persisted)clearCase()});
