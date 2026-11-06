'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('canonical synthetic cheque workshop: browser generates, invalidates and blocks conflicting drafts', (t) => {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
  const binary = candidates.find(p => fs.existsSync(p));
  if (!binary) {
    if (process.env.CI === 'true') assert.fail('Chromium is required in CI; synthetic cheque E2E must not silently skip');
    return t.skip('Chromium not installed in local environment');
  }
  const source = fs.readFileSync(path.join(__dirname, '../experimental/synthetic-cheque-browser.html'), 'utf8');
  assert.ok(source.includes('id="generate"') && source.includes('id="download"'));
  const injected = `<script>
    window.addEventListener('load', () => {
      const check = (ok, message) => { if (!ok) throw Error(message); };
      try {
        check(document.getElementById('download').disabled, 'export enabled before first draft');
        document.getElementById('generate').click();
        check(!document.getElementById('result').hidden, 'draft not shown');
        check(document.getElementById('download').disabled, 'unanswered interview allowed download');
        document.getElementById('issue-date').value = 'yes';
        document.getElementById('certificate').value = 'no';
        document.getElementById('defense').value = 'yes';
        document.getElementById('generate').click();
        check(!document.getElementById('download').disabled, 'completed consistent interview blocked export');
        check(document.getElementById('report').textContent.includes('وظایف بازبینی'), 'review tasks absent');
        document.getElementById('download').focus();
        document.getElementById('role').value = 'قاضی';
        document.getElementById('role').dispatchEvent(new Event('change'));
        check(document.getElementById('result').hidden && document.getElementById('download').disabled, 'role change retained stale draft');
        check(document.activeElement === document.getElementById('generate'), 'keyboard focus stranded inside hidden draft');
        document.getElementById('certificate').value = 'no';
        document.querySelector('input[value="گواهی عدم پرداخت نمونه"]').checked = true;
        document.getElementById('generate').click();
        check(document.getElementById('download').disabled, 'contradictory certificate allowed download');
        check(document.getElementById('report').textContent.includes('تعارض'), 'conflict missing');
        document.getElementById('reset').click();
        check(document.getElementById('result').hidden && document.getElementById('download').disabled, 'reset retained draft');
        document.documentElement.dataset.browserTest = 'PASS';
      } catch (error) {
        document.documentElement.dataset.browserTest = 'FAIL:' + error.message;
      }
    });
  <\/script>`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-browser-'));
  try {
    const file = path.join(temp, 'case.html');
    fs.writeFileSync(file, source.replace('</body>', injected + '</body>'));
    const result = spawnSync(binary, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--virtual-time-budget=2500', '--dump-dom', 'file://' + file], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr?.slice(-500));
    assert.match(result.stdout, /data-browser-test="PASS"/, result.stdout.match(/data-browser-test="[^"]+"/)?.[0] || 'browser test did not finish');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
