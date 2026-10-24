'use strict';
// Real Chrome/Chromium smoke test, synthetic data only. No deploy or legal-accuracy claims.
// Run explicitly with CHROME_BIN; separate from the dependency-free contract test suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../backend/server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch { /* startup */ }
    await delay(100);
  }
  throw new Error('Timed out waiting for ' + label);
}

function cdpClient(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const task = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
  });
  socket.addEventListener('close', () => {
    for (const task of pending.values()) task.reject(new Error('Browser disconnected'));
    pending.clear();
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      await ready;
      const id = ++nextId;
      return Promise.race([
        new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          socket.send(JSON.stringify({ id, method, params }));
        }),
        delay(10000).then(() => { throw new Error('CDP timeout: ' + method); }),
      ]);
    },
    close() { socket.close(); },
  };
}

test('real Chromium: Persian interview, report, and privacy reset', { timeout: 45000 }, async () => {
  assert.ok(process.env.CHROME_BIN, 'CHROME_BIN is required for the browser release gate');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-browser-'));
  const server = createServer({ rateLimit: { max: 100, windowMs: 60000 } });
  let browser, cdp;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = spawn(process.env.CHROME_BIN, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-extensions', '--disable-background-networking', '--no-first-run',
      '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, 'about:blank',
    ], { stdio: 'ignore' });
    const port = await waitFor(() => {
      const file = path.join(profile, 'DevToolsActivePort');
      return fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').split('\n')[0]) : null;
    }, 'Chrome DevTools');
    const tabs = await waitFor(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      return response.ok ? response.json() : null;
    }, 'Chrome target');
    const tab = tabs.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
    assert.ok(tab, 'Browser tab available');
    cdp = cdpClient(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const nav = await cdp.send('Page.navigate', { url: base + '/' });
    assert.ok(!nav.errorText, 'Chrome navigation failed: ' + nav.errorText);
    async function evaluate(expression) {
      const result = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      });
      assert.ok(!result.exceptionDetails, 'Browser script raised an exception');
      return result.result.value;
    }
    await waitFor(() => evaluate(
      "document.readyState === 'complete' && typeof flows === 'object' && " +
      "typeof questionsFor === 'function' && !!document.getElementById('start').onclick"
    ), 'Dadyar browser scripts');

    const started = await evaluate("(() => {" +
      "document.getElementById('topic').value='theft';" +
      "document.getElementById('role').value='شاهد';" +
      "document.getElementById('story').value='شرح کاملاً ساختگی پرونده برای آزمون مرورگر';" +
      "document.getElementById('start').click();" +
      "return [document.getElementById('questionBox').style.display," +
      "document.getElementById('qProgress').textContent]})()");
    assert.equal(started[0], 'block');
    assert.match(started[1], /1 از 5/);

    const finished = await evaluate("(() => {" +
      "for(let i=0;i<5;i++){document.getElementById('answer').value='پاسخ ساختگی '+(i+1);" +
      "document.getElementById('next').click();}" +
      "return [document.getElementById('results').style.display," +
      "document.getElementById('summary').children.length," +
      "report().includes('گزارش آزمایشی دادیار')]})()");
    assert.deepEqual(finished, ['block', 9, true]);

    const cleared = await evaluate("(() => {" +
      "document.getElementById('reset').click();" +
      "return [state===null,document.getElementById('story').value," +
      "document.getElementById('summary').children.length," +
      "document.getElementById('startBox').style.display]})()");
    assert.deepEqual(cleared, [true, '', 0, 'block']);
  } finally {
    if (cdp) cdp.close();
    if (browser) browser.kill('SIGTERM');
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
