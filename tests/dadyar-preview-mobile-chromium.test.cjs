'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('offline Dadyar preview parses in headless Chromium at a narrow viewport', { timeout: 15000 }, t => {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  const chrome = candidates.find(candidate => fs.existsSync(candidate));
  if (!chrome) {
    if (process.env.CI === 'true') assert.fail('Chromium required for offline preview smoke test');
    return t.skip('Chromium unavailable locally');
  }

  const source = path.resolve(__dirname, '../dadyar-preview/index.html');
  const html = fs.readFileSync(source, 'utf8');
  assert.match(html, /<html[^>]+lang="fa"[^>]+dir="rtl"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /<(?:script|link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i);

  const run = spawnSync(chrome, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=375,812',
    '--dump-dom',
    'file://' + source
  ], { encoding: 'utf8', timeout: 12000 });

  assert.equal(run.status, 0, (run.stderr || '').slice(-3000));
  assert.match(run.stdout, /کارگاه آزمایشی دادیار: چک فرضی/);
  assert.match(run.stdout, /id="free-question"/);
  assert.match(run.stdout, /id="download" disabled/);
  assert.match(run.stdout, /id="delay-damages-calculator"/);
  assert.match(run.stdout, /id="delay-principal"/);
  assert.match(run.stdout, /id="delay-calculate"/);
  assert.match(html, /3333\.9/);
  assert.doesNotMatch(html, /3323\.9/);
  assert.match(run.stdout, /connect-src 'none'/);
});
