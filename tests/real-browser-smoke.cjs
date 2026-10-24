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

async function waitFor(check, label, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
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
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }, 10000);
        pending.set(id, {
          resolve: value => { clearTimeout(timer); resolve(value); },
          reject: error => { clearTimeout(timer); reject(error); },
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

// Chrome subprocesses may continue writing their disposable profile after the
// parent exits. Cleanup must not turn an otherwise successful browser test into
// a false product failure. Hosted CI runners discard these synthetic-only files.
async function removeDisposableDirectory(directory) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      if (attempt === 11) {
        process.stderr.write('WARNING: synthetic Chrome temp cleanup deferred; runner must discard temporary files\\n');
        return;
      }
      await delay(250);
    }
  }
}

test('real Chromium: Persian interview, report, and privacy reset', { timeout: 75000 }, async () => {
  assert.ok(process.env.CHROME_BIN, 'CHROME_BIN is required for the browser release gate');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-browser-'));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-report-'));
  const server = createServer({ rateLimit: { max: 100, windowMs: 60000 } });
  // Count requests only; never retain or log the synthetic case body.
  let validationPosts = 0;
  server.on('request', req => {
    if (req.method === 'POST' && req.url === '/api/cases/validate') validationPosts++;
  });
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
    // Hosted CI runners can take over 12s to start Chrome after contract tests.
    // Allow more startup time without relaxing any browser assertions.
    const port = await waitFor(() => {
      const file = path.join(profile, 'DevToolsActivePort');
      return fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').split('\n')[0]) : null;
    }, 'Chrome DevTools', 25000);
    const tabs = await waitFor(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      return response.ok ? response.json() : null;
    }, 'Chrome target');
    const tab = tabs.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
    assert.ok(tab, 'Browser tab available');
    cdp = cdpClient(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // Allow downloads only inside this disposable test directory.
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
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
      "for(let i=0;i<5;i++){if(i===1){document.getElementById('skip').click();continue;}" +
      "document.getElementById('answer').value='پاسخ ساختگی '+(i+1);" +
      "document.getElementById('next').click();}" +
      "return [document.getElementById('results').style.display," +
      "document.getElementById('summary').children.length," +
      "report().includes('گزارش آزمایشی دادیار')," +
      "report().includes('اطلاعات تکمیل‌نشده')]})()");
    assert.deepEqual(finished, ['block', 9, true, true]);

    // Intake and report generation must never transmit case data by default.
    assert.equal(validationPosts, 0, 'no automatic API submission');
    await evaluate("(() => { window.confirm=()=>false; document.getElementById('validateLocal').click(); })()");
    assert.equal(validationPosts, 0, 'declining consent must not send a request');
    await evaluate("(() => { window.confirm=()=>true; document.getElementById('validateLocal').click(); })()");
    await waitFor(() => evaluate(
      "document.getElementById('validationStatus').textContent.includes('ساختار پرونده توسط API محلی تأیید شد')"
    ), 'consented local API validation');
    assert.equal(validationPosts, 1, 'one API request only after explicit consent');

    // Verify an actual browser download, not just the in-memory report() string.
    await evaluate("(() => { window.confirm=()=>false; document.getElementById('download').click(); return true; })()");
    assert.deepEqual(fs.readdirSync(downloads), [], 'declining export must create no file');
    await evaluate("(() => { window.confirm=()=>true; document.getElementById('download').click(); return true; })()");
    const reportPath = path.join(downloads, 'dadyar-case-report.txt');
    await waitFor(() => fs.existsSync(reportPath) &&
      !fs.readdirSync(downloads).some(name => name.endsWith('.crdownload')),
    'completed browser report download');
    const downloaded = fs.readFileSync(reportPath, 'utf8');
    assert.ok(downloaded.startsWith('\ufeffگزارش آزمایشی دادیار'), 'UTF-8 BOM and Persian title');
    assert.match(downloaded, /شرح کاملاً ساختگی پرونده/, 'synthetic narrative exported');
    assert.match(downloaded, /اطلاعات تکمیل‌نشده/, 'skipped question identified');
    assert.doesNotMatch(downloaded, /پیوند به پایگاه رسمی برای مطالعه/,
      'unreviewed legal citations must not be invented');
    assert.equal(validationPosts, 1, 'export must not transmit case data');

    const cleared = await evaluate("(() => {" +
      "document.getElementById('reset').click();" +
      "return [state===null,document.getElementById('story').value," +
      "document.getElementById('summary').children.length," +
      "document.getElementById('startBox').style.display]})()");
    assert.deepEqual(cleared, [true, '', 0, 'block']);
    assert.ok(fs.existsSync(reportPath), 'reset cannot delete an already downloaded local file');

    // Exercise every phase-1 topic and role in a real browser. All inputs are synthetic.
    // A passing contract test alone does not prove that DOM controls work end-to-end.
    const phaseOneJourneys = await evaluate(`(() => {
      const topics = [...document.getElementById('topic').options].map(option => option.value);
      const roles = [...document.getElementById('role').options].map(option => option.value);
      const journeys = [];
      for (const topic of topics) for (const role of roles) {
        document.getElementById('topic').value = topic;
        document.getElementById('role').value = role;
        document.getElementById('story').value = 'شرح ساختگی برای پوشش مرورگری موضوع و نقش';
        document.getElementById('start').click();
        const count = questionsFor(topic, role).length;
        const interviewVisible = getComputedStyle(document.getElementById('questionBox')).display === 'block';
        for (let i = 0; i < count; i++) document.getElementById('skip').click();
        const text = report();
        const resultVisible = getComputedStyle(document.getElementById('results')).display === 'block';
        const complete = unresolvedQuestions().length === count &&
          text.includes('موضوع: ' + flows[topic].title) &&
          text.includes('نقش: ' + role) &&
          text.includes('اطلاعات تکمیل‌نشده') &&
          text.includes('مدارک احتمالی برای بررسی:') &&
          !text.includes('پیوند به پایگاه رسمی برای مطالعه');
        document.getElementById('reset').click();
        const cleared = state === null && document.getElementById('story').value === '' &&
          document.getElementById('summary').children.length === 0 &&
          getComputedStyle(document.getElementById('startBox')).display === 'block';
        journeys.push({ topic, role, count, interviewVisible, resultVisible, complete, cleared });
      }
      return journeys;
    })()`);
    assert.equal(phaseOneJourneys.length, 24, 'all six topics x four roles are exercised');
    assert.deepEqual([...new Set(phaseOneJourneys.map(item => item.topic))].sort(),
      ['check', 'debt', 'divorce', 'fraud', 'mehrieh', 'theft']);
    assert.deepEqual([...new Set(phaseOneJourneys.map(item => item.role))].sort(),
      ['خوانده / متهم', 'خواهان / شاکی', 'شاهد', 'وکیل'].sort());
    for (const journey of phaseOneJourneys) {
      assert.ok(journey.count >= 5 && journey.interviewVisible && journey.resultVisible &&
        journey.complete && journey.cleared,
      'browser journey failed: ' + journey.topic + ' / ' + journey.role);
    }
    assert.equal(validationPosts, 1, 'all phase-1 journeys remain local without new API posts');

    // Exercise actual navigation and browser Back, not a synthetic pagehide event.
    // A restored BFCache page must never expose the previous interview.
    const beforeLeave = await evaluate("(() => {" +
      "document.getElementById('topic').value='fraud';" +
      "document.getElementById('role').value='شاهد';" +
      "document.getElementById('story').value='داستان محرمانه ساختگی فقط برای آزمون بازگشت';" +
      "document.getElementById('start').click();" +
      "return [state !== null, document.getElementById('questionBox').style.display]})()");
    assert.deepEqual(beforeLeave, [true, 'block']);
    const away = await cdp.send('Page.navigate', { url: base + '/health' });
    assert.ok(!away.errorText, 'Navigation away failed: ' + away.errorText);
    await waitFor(() => evaluate("location.pathname === '/health'"), 'navigation away');
    await evaluate('history.back()');
    await waitFor(() => evaluate(
      "location.pathname === '/' && document.readyState === 'complete' && " +
      "!!document.getElementById('start') && typeof state !== 'undefined'"
    ), 'return to interview after browser Back');
    const afterBack = await evaluate("(() => [" +
      "state === null, document.getElementById('story').value," +
      "document.getElementById('summary').children.length," +
      "getComputedStyle(document.getElementById('startBox')).display" +
      "])()");
    assert.deepEqual(afterBack, [true, '', 0, 'block'],
      'browser Back must not restore case data, even with BFCache');
    assert.equal(validationPosts, 1, 'navigation must not send case data');
    assert.ok(fs.existsSync(reportPath), 'navigation cannot erase a downloaded report');

  } finally {
    if (cdp) cdp.close();
    // Wait for Chrome to stop writing its profile before deleting the directory.
    // A signal alone is asynchronous and previously caused intermittent ENOTEMPTY.
    if (browser && browser.exitCode === null && browser.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => {
          browser.kill('SIGKILL');
          resolve();
        }, 3000);
        browser.once('exit', () => { clearTimeout(timer); resolve(); });
        browser.kill('SIGTERM');
      });
    }
    if (server.listening) await new Promise(resolve => server.close(resolve));
    // Chrome subprocesses may briefly retain files after the parent exits.
    await removeDisposableDirectory(profile);
    await removeDisposableDirectory(downloads);
  }
});
