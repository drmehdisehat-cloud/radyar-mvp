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
  const probe = `<script>
  window.addEventListener('load', () => {
    const check=(condition,message)=>{if(!condition)throw Error(message)};
    try {
      let calls=0;
      const originalFetch=window.fetch;
      window.fetch=(...args)=>{calls++;return Promise.reject(Error('network forbidden'))};
      const originalOpen=XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open=function(){calls++;throw Error('network forbidden')};
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
      // Reset must clear all synthetic answers, selected evidence and export consent.
      document.getElementById('reset').click();
      check(document.getElementById('result').hidden,'reset left a visible draft');
      check(download.disabled,'reset left download enabled');
      check(!document.getElementById('export-ack').checked,'reset retained consent');
      check([...document.querySelectorAll('#interview select')].every(el=>el.value==='unknown'),'reset retained interview answers');
      check([...document.querySelectorAll('fieldset input[type=checkbox]')].every(el=>!el.checked),'reset retained synthetic evidence');
      check(document.activeElement===document.getElementById('role'),'reset did not restore keyboard focus');
      check(calls===0,'application attempted network calls');
      check(performance.getEntriesByType('resource').length===0,'unexpected external resource load');
      window.fetch=originalFetch;XMLHttpRequest.prototype.open=originalOpen;
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
