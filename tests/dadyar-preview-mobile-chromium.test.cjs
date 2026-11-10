'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('deployable offline preview: mobile layout, gated export and zero API calls in real Chromium', (t) => {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
  const chrome = candidates.find(p => fs.existsSync(p));
  if (!chrome) {
    if (process.env.CI === 'true') assert.fail('Chromium required for offline preview gate');
    return t.skip('Chromium unavailable locally');
  }
  const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
  assert.match(html, /connect-src 'none'/);
  // A zero-call probe alone misses remote loads attempted before the load handler.
  // Reject external resource declarations at source level as a second offline gate.
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /id="free-question"[^>]*maxlength="300"/);
  assert.match(html, /getElementById\('free-question'\)\.addEventListener\('input',invalidateDraft\)/);
  assert.match(html, /پاسخ خودکار حقوقی: ارائه نمی‌شود/);
  // Regex literals use single backslashes for word boundaries and whitespace classes.
  // Double escaping here previously made these checks silently miss real URLs/API calls.
  assert.doesNotMatch(html, /<(?:script|link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/);

  const probe = `<script>
  window.addEventListener('load', () => {
    const check=(condition,message)=>{if(!condition)throw Error(message)};
    try {
      let calls=0;
      const originalFetch=window.fetch;
      window.fetch=(...args)=>{calls++;return Promise.reject(Error('network forbidden'))};
      const originalOpen=XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open=function(){calls++;throw Error('network forbidden')};
      // Guard additional browser transports: fetch/XHR alone cannot prove zero API attempts.
      const originalBeacon=navigator.sendBeacon;
      navigator.sendBeacon=function(){calls++;return false};
      const originalWebSocket=window.WebSocket;
      window.WebSocket=function(){calls++;throw Error('network forbidden')};
      const originalEventSource=window.EventSource;
      window.EventSource=function(){calls++;throw Error('network forbidden')};
      // Chromium headless may enforce a minimum viewport width despite --window-size=375.
      // Validate its actual narrow desktop viewport; true mobile emulation needs CDP/device testing.
      check(document.documentElement.clientWidth<=520,'headless narrow viewport exceeds 520px');
      check(document.documentElement.scrollWidth<=document.documentElement.clientWidth+1,'horizontal overflow on mobile');
      const download=document.getElementById('download');
      check(download.disabled,'download initially enabled');
      document.getElementById('generate').click();
      check(download.disabled,'unknown interview allowed download');
      document.getElementById('issue-date').value='yes';
      document.getElementById('certificate').value='no';
      document.getElementById('defense').value='yes';
      document.getElementById('generate').click();
      check(download.disabled,'export without acknowledgement');
      document.getElementById('export-ack').click();
      check(!download.disabled,'completed acknowledged interview blocked');
      // Contradictory evidence must invalidate export, even with completed answers.
      const certificateEvidence=[...document.querySelectorAll('fieldset input[type=checkbox]')].find(el=>el.value==='گواهی عدم پرداخت نمونه');
      check(!!certificateEvidence,'synthetic certificate evidence fixture missing');
      certificateEvidence.checked=true;
      certificateEvidence.dispatchEvent(new Event('change',{bubbles:true}));
      check(download.disabled && document.getElementById('result').hidden,'evidence mutation retained stale export');
      document.getElementById('generate').click();
      check(download.disabled,'contradictory certificate evidence permitted export');
      check(document.getElementById('export-status').textContent.includes('تناقض'),'contradiction warning absent');
      certificateEvidence.checked=false;
      certificateEvidence.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('generate').click();
      check(download.disabled,'regenerated report bypassed acknowledgement');
      document.getElementById('export-ack').click();
      check(!download.disabled,'resolved contradiction and new acknowledgement did not permit export');
      // A successful synthetic export must consume consent, preventing repeated downloads.
      download.click();
      check(download.disabled,'export remained enabled after download');
      check(!document.getElementById('export-ack').checked,'export retained prior human-review acknowledgement');
      check(document.getElementById('export-status').textContent.includes('مجدداً'),'export confirmation absent');
      document.getElementById('export-ack').click();
      check(!download.disabled,'fresh acknowledgement did not re-enable export');
      document.getElementById('defense').value='no';
      document.getElementById('defense').dispatchEvent(new Event('change',{bubbles:true}));
      check(download.disabled && document.getElementById('result').hidden,'stale report export after mutation');
      check(!document.getElementById('export-ack').checked,'acknowledgement persisted after mutation');
      // Changing the simulated professional role must also invalidate the draft
      // and require a fresh interview generation and human-review acknowledgement.
      document.getElementById('defense').value='yes';
      document.getElementById('defense').dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('generate').click();
      document.getElementById('export-ack').click();
      check(!download.disabled,'role-change fixture did not enable synthetic export');
      const role=document.getElementById('role');
      // A keyboard user focused inside the draft must not be stranded in hidden content.
      document.getElementById('export-ack').focus();
      check(document.activeElement===document.getElementById('export-ack'),'focus fixture failed');
      role.value='قاضی';
      role.dispatchEvent(new Event('change',{bubbles:true}));
      check(document.activeElement===document.getElementById('generate'),'hidden draft retained keyboard focus');
      check(download.disabled && document.getElementById('result').hidden,'role mutation retained old export');
      check(!document.getElementById('export-ack').checked,'role mutation retained acknowledgement');
      document.getElementById('generate').click();
      check(download.disabled,'new simulated role bypassed review acknowledgement');
      check(document.getElementById('report').textContent.includes('نقش: قاضی'),'regenerated report retained stale role');
      document.getElementById('export-ack').click();
      check(!download.disabled,'fresh review acknowledgement blocked after role change');
      // Evidence changes must also return keyboard focus from a now-hidden report.
      document.getElementById('download').focus();
      check(document.activeElement===download,'evidence focus fixture failed');
      certificateEvidence.checked=true;
      certificateEvidence.dispatchEvent(new Event('change',{bubbles:true}));
      check(document.activeElement===document.getElementById('generate'),'evidence mutation stranded focus in hidden report');
      check(download.disabled && document.getElementById('result').hidden,'evidence mutation retained export');
      certificateEvidence.checked=false;
      certificateEvidence.dispatchEvent(new Event('change',{bubbles:true}));
      // A selected settlement claim contradicts an interview denying any defense.
      // Even an explicit acknowledgement must not override this contradiction.
      const settlement=[...document.querySelectorAll('fieldset input[type=checkbox]')].find(el=>el.value==='ادعای تسویه وجه در پرونده فرضی');
      check(!!settlement,'synthetic settlement fixture missing');
      settlement.checked=true;
      settlement.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('defense').value='no';
      document.getElementById('generate').click();
      check(document.getElementById('report').textContent.includes('ادعای تسویه در فهرست ادله مخالف'),'settlement contradiction missing from draft');
      document.getElementById('export-ack').click();
      check(download.disabled,'settlement contradiction bypassed export gate');
      settlement.checked=false;
      settlement.dispatchEvent(new Event('change',{bubbles:true}));
      // A settlement claim without a synthetic cheque image is insufficient for a cheque report.
      document.getElementById('reset').click();
      settlement.checked=true;
      settlement.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('issue-date').value='yes';
      document.getElementById('certificate').value='no';
      document.getElementById('defense').value='yes';
      document.getElementById('generate').click();
      check(document.getElementById('report').textContent.includes('تصویر چک نمونه انتخاب نشده است'),'missing cheque evidence warning absent');
      document.getElementById('export-ack').click();
      check(download.disabled,'settlement-only evidence bypassed cheque export gate');
      check(document.getElementById('export-status').textContent.includes('تصویر چک نمونه انتخاب نشده است'),'missing cheque evidence status absent');
      // An empty synthetic evidence set must never become downloadable, even with all answers complete.
      document.getElementById('reset').click();
      document.getElementById('issue-date').value='yes';
      document.getElementById('certificate').value='no';
      document.getElementById('defense').value='no';
      document.getElementById('generate').click();
      check(document.getElementById('report').textContent.includes('هیچ مدرک فرضی انتخاب نشده است'),'missing-evidence warning absent');
      document.getElementById('export-ack').click();
      check(download.disabled,'empty evidence set bypassed export gate');
      check(document.getElementById('export-status').textContent.includes('هیچ مدرک فرضی انتخاب نشده است'),'empty evidence warning absent from status');
      // Offline topic hints stay internal: assert their IDs without rendering labels in the report.
      document.getElementById('free-question').value='آیا چک و مهریه در این مثال مرتبط هستند؟';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      const internalTopicIds=classifyQuestion(document.getElementById('free-question').value).map(item=>item.id);
      const routedReport=document.getElementById('report').textContent;
      check(internalTopicIds.includes('instruments') && internalTopicIds.includes('family'),'multi-topic offline hints absent from internal router');
      check(routedReport.includes('دسته‌بندی داخلی: چندموضوعی و غیرقطعی'),'internal routing disclosure missing');
      check(!routedReport.includes('برچسب‌های موضوعی پیشنهادی'),'internal topic labels leaked into report');
      check(routedReport.includes('دامنه این پیش‌نمایش: کارگاه چک فرضی'),'preview scope warning absent');
      check(routedReport.includes('پاسخ خودکار حقوقی: ارائه نمی‌شود'),'offline hints impersonated legal AI');
      document.getElementById('free-question').value='موضوعی بی‌ارتباط';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      check(document.getElementById('result').hidden && download.disabled,'free question change retained old report');
      document.getElementById('generate').click();
      check(classifyQuestion(document.getElementById('free-question').value).length===0,'unmatched question was falsely classified');
      check(!document.getElementById('report').textContent.includes('برچسب‌های موضوعی پیشنهادی'),'unmatched question exposed internal labels');
      // Free-text intake must not allow export of likely real contact or card identifiers.
      document.getElementById('reset').click();
      const cheque=[...document.querySelectorAll('fieldset input[type=checkbox]')].find(el=>el.value==='تصویر چک نمونه با شماره ساختگی');
      cheque.checked=true;
      document.getElementById('issue-date').value='yes';
      document.getElementById('certificate').value='no';
      document.getElementById('defense').value='no';
      document.getElementById('free-question').value='تماس با 09123456789';
      document.getElementById('generate').click();
      check(document.getElementById('report').textContent.includes('شناسه حساس احتمالی'),'privacy warning absent');
      check(!document.getElementById('report').textContent.includes('09123456789'),'sensitive mobile echoed in visible draft');
      document.getElementById('export-ack').click();
      check(download.disabled,'likely phone identifier bypassed export gate');
      check(document.getElementById('export-status').textContent.includes('شناسه حساس'),'privacy export status absent');
      document.getElementById('free-question').value='کارت 6037 9912 3456 7890';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      document.getElementById('export-ack').click();
      check(download.disabled,'likely bank card identifier bypassed export gate');
      document.getElementById('free-question').value='تماس با ۰۹۱۲۳۴۵۶۷۸۹';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      document.getElementById('export-ack').click();
      check(download.disabled,'Persian-digit mobile identifier bypassed export gate');
      check(document.getElementById('export-status').textContent.includes('شناسه حساس'),'Persian-digit privacy warning missing');
      document.getElementById('free-question').value='بطاقة ٦٠٣٧ ٩٩١٢ ٣٤٥٦ ٧٨٩٠';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      document.getElementById('export-ack').click();
      check(download.disabled,'Arabic-digit bank-card identifier bypassed export gate');
      check(!document.getElementById('report').textContent.includes('٦٠٣٧ ٩٩١٢ ٣٤٥٦ ٧٨٩٠'),'Arabic-digit card echoed in visible draft');
      // Suspected email addresses must not be echoed or exported in an offline draft.
      document.getElementById('free-question').value='ایمیل test.person@example.com';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      check(document.getElementById('free-question').value==='','suspected email was retained in input');
      check(!document.getElementById('report').textContent.includes('test.person@example.com'),'suspected email echoed in draft');
      document.getElementById('export-ack').click();
      check(download.disabled,'suspected email bypassed export gate');
      // A possible ten-digit national ID must not be echoed or exported, including Persian digits.
      document.getElementById('free-question').value='کد ملی ۰۰۱۲۳۴۵۶۷۸';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      check(document.getElementById('free-question').value==='','possible national ID retained in input');
      check(!document.getElementById('report').textContent.includes('۰۰۱۲۳۴۵۶۷۸'),'possible national ID echoed');
      document.getElementById('export-ack').click();
      check(download.disabled,'possible national ID bypassed export gate');
      document.getElementById('free-question').value='چک فرضی';
      document.getElementById('free-question').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('generate').click();
      document.getElementById('export-ack').click();
      check(!download.disabled,'safe synthetic question did not restore export');
      // Reset must clear all synthetic answers, selected evidence and export consent.
      document.getElementById('reset').click();
      check(document.getElementById('result').hidden,'reset left a visible draft');
      check(download.disabled,'reset left download enabled');
      check(!document.getElementById('export-ack').checked,'reset retained consent');
      check([...document.querySelectorAll('#interview select')].every(el=>el.value==='unknown'),'reset retained interview answers');
      check([...document.querySelectorAll('fieldset input[type=checkbox]')].every(el=>!el.checked),'reset retained synthetic evidence');
      check(document.activeElement===document.getElementById('role'),'reset did not restore keyboard focus');
      check(document.getElementById('reset-status').textContent.includes('پاک شدند'),'reset confirmation missing');
      document.getElementById('role').value='قاضی';
      document.getElementById('role').dispatchEvent(new Event('change',{bubbles:true}));
      check(document.getElementById('reset-status').textContent==='','stale reset confirmation survived case change');
      check(calls===0,'application attempted network calls');
      check(performance.getEntriesByType('resource').length===0,'unexpected external resource load');
      window.fetch=originalFetch;XMLHttpRequest.prototype.open=originalOpen;
      navigator.sendBeacon=originalBeacon;window.WebSocket=originalWebSocket;window.EventSource=originalEventSource;
      document.documentElement.dataset.previewGate='PASS';
    } catch(e){document.documentElement.dataset.previewGate='FAIL:'+e.message}
  });
  <\/script>`;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dadyar-preview-mobile-'));
  try {
    const file=path.join(dir,'index.html');
    fs.writeFileSync(file,html.replace('</body>',probe+'</body>'));
    const run=spawnSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=375,812','--virtual-time-budget=2500','--dump-dom','file://'+file],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stderr?.slice(-500));
    assert.match(run.stdout,/data-preview-gate="PASS"/,run.stdout.match(/data-preview-gate="[^"]+"/)?.[0]||'probe did not complete');
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
