'use strict';
// Public introduction only. Never embed provider credentials or fake AI replies.
(() => {
  if (document.getElementById('dadyar-companion-host')) return;
  const source = document.currentScript;
  const cssURL = new URL('dadyar-widget.css', source.src).href;
  function mount() {
    if (document.getElementById('dadyar-companion-host')) return;
    const host = document.createElement('div');
    host.id = 'dadyar-companion-host';
    const shadow = host.attachShadow({mode:'open'});
    const make = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const styles = make('link'); styles.rel = 'stylesheet'; styles.href = cssURL;
    const companion = make('aside', '', 'companion');
    companion.dir = 'rtl'; companion.setAttribute('aria-label','همراه دادیار');
    const greeting = make('div','','greeting');
    const dismiss = make('button','×','dismiss');
    dismiss.type='button'; dismiss.setAttribute('aria-label','بستن پیام معرفی دادیار');
    greeting.append(dismiss,make('p','من دستیار هوشمند حقوقی دادیارم؛ هر سؤالی داری از من بپرس.'),make('small','نسخه نمایشی · پاسخ‌گوی زنده هنوز فعال نیست'));
    const panel = make('section','','panel'); panel.id='dadyar-panel'; panel.hidden=true;
    const title = make('h2','ارتباط با دادیار'); title.id='dadyar-panel-title';
    panel.setAttribute('aria-labelledby',title.id);
    const close = make('button','بستن','close'); close.type='button';
    const link = (label,href) => {const a=make('a',label);a.href=href;return a;};
    panel.append(title,make('p','گفت‌وگوی خودکار در حال آماده‌سازی است. فعلاً می‌توانید نمونه‌های ساختگی را ببینید یا با دفتر ارتباط بگیرید.'),
      link('دیدن نمونه‌های دادیار','/dadyar.html#topics'),link('ارتباط با دفتر وکالت','/contact.html'),
      make('small','اطلاعات محرمانه یا اسناد واقعی را ارسال نکنید.'),close);
    const launch = make('button','','launch'); launch.type='button';
    launch.setAttribute('aria-label','بازکردن همراه دادیار');
    launch.setAttribute('aria-expanded','false');launch.setAttribute('aria-controls',panel.id);
    const portrait=make('img');portrait.src='/dadyar-mehdi-avatar-v1.png';portrait.alt='';
    portrait.width=112;portrait.height=134;portrait.decoding='async';
    launch.append(portrait,make('span','دادیار'));
    const motion=make('button','توقف حرکت','motion');motion.type='button';motion.setAttribute('aria-pressed','false');
    launch.addEventListener('click',()=>{
      panel.hidden=!panel.hidden;greeting.hidden=true;
      launch.setAttribute('aria-expanded',String(!panel.hidden));
      if(!panel.hidden)close.focus();
    });
    function closePanel(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();}
    close.addEventListener('click',closePanel);
    shadow.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){closePanel();e.stopPropagation();}});
    dismiss.addEventListener('click',()=>{greeting.hidden=true;launch.focus();});
    motion.addEventListener('click',()=>{
      const paused=companion.classList.toggle('paused');
      motion.setAttribute('aria-pressed',String(paused));motion.textContent=paused?'ادامه حرکت':'توقف حرکت';
    });
    companion.append(greeting,panel,launch,motion);shadow.append(styles,companion);document.body.append(host);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
