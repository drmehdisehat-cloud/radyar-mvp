'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('delay-damages preview fails closed until official source and human legal review are verified', { timeout: 15000 }, t => {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  const chrome = candidates.find(candidate => fs.existsSync(candidate));
  if (!chrome) {
    if (process.env.CI === 'true') assert.fail('Chromium is required for the source-verification gate');
    return t.skip('Chromium unavailable locally');
  }

  const source = path.resolve(__dirname, '../dadyar-preview/index.html');
  const html = fs.readFileSync(source, 'utf8');
  assert.match(html, /data-source-status="transcribed-not-independently-authenticated"/);
  assert.match(html, /data-legal-review-status="not-reviewed"/);
  assert.match(html, /محاسبه مسدود است/);

  // Add only this temporary harness script's hash to the test copy's strict CSP.
  // The production source and its CSP remain unchanged.
  const injectedScript = `window.addEventListener('load', () => {
    try {
      const root = document.getElementById('delay-damages-calculator');
      const button = document.getElementById('delay-calculate');
      const result = document.getElementById('delay-result');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      check(button.disabled, 'calculator must start disabled for unverified evidence');
      const cases = [
        ['transcribed-not-independently-authenticated', 'not-reviewed'],
        ['verified', 'not-reviewed'],
        ['transcribed-not-independently-authenticated', 'approved'],
        ['', 'approved'],
        ['verified', '']
      ];
      for (const [sourceStatus, reviewStatus] of cases) {
        root.dataset.sourceStatus = sourceStatus;
        root.dataset.legalReviewStatus = reviewStatus;
        button.disabled = false;
        button.click();
        check(button.disabled, 'missing source/review gate did not re-disable calculator');
        check(result.textContent.includes('محاسبه مسدود است'), 'blocked state message missing');
        check(!result.textContent.includes('مبلغ تعدیل‌شده'), 'unverified amount was displayed');
      }
      document.documentElement.dataset.delaySourceGate = 'PASS';
    } catch (error) {
      document.documentElement.dataset.delaySourceGate = 'FAIL:' + error.message;
    }
  });`;
  const harnessHash = crypto.createHash('sha256').update(injectedScript).digest('base64');
  const cspPattern = /script-src '[^']+';/;
  assert.match(html, cspPattern, 'strict script-src CSP must be present');
  const testCspHtml = html.replace(cspPattern, match => match.slice(0, -1) + " 'sha256-" + harnessHash + "';");
  const injected = '<script>' + injectedScript + '</script>';

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-delay-source-gate-'));
  try {
    const file = path.join(temp, 'preview.html');
    fs.writeFileSync(file, testCspHtml.replace('</body>', injected + '</body>'));
    const run = spawnSync(chrome, [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--virtual-time-budget=2000',
      '--dump-dom',
      'file://' + file
    ], { encoding: 'utf8', timeout: 12000 });
    assert.equal(run.status, 0, (run.stderr || '').slice(-3000));
    assert.match(run.stdout, /data-delay-source-gate="PASS"/,
      run.stdout.match(/data-delay-source-gate="[^"]+"/)?.[0] || 'browser gate did not finish');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
