'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDevToolsPort(file, child, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error('Chromium exited before DevTools became ready');
    try {
      const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await delay(50);
  }
  throw Error('Chromium DevTools port did not become ready');
}

function signalChromiumTree(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function createCdpClient(url) {
  assert.equal(typeof WebSocket, 'function', 'Node.js 22 WebSocket support is required');
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(Error(message.error.message || 'CDP command failed'));
      else entry.resolve(message.result || {});
      return;
    }
    if (message.method && listeners.has(message.method)) {
      for (const listener of listeners.get(message.method)) listener(message.params || {});
    }
  });

  socket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error('Chromium DevTools websocket closed'));
    }
    pending.clear();
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(Error('Could not connect to Chromium DevTools')), { once: true });
  });

  function command(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('CDP command timed out: ' + method));
      }, 7000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, listener) {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(listener);
  }

  return { socket, opened, command, on };
}

test('mobile preview is served at the exact HTTP subpath and accepts real touch input without network access', {
  timeout: 30000
}, async t => {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  const chrome = candidates.find(candidate => fs.existsSync(candidate));
  if (!chrome) {
    if (process.env.CI === 'true') assert.fail('Chromium required for mobile HTTP subpath test');
    return t.skip('Chromium unavailable locally');
  }

  const preview = path.resolve(__dirname, '../dadyar-preview/index.html');
  const html = fs.readFileSync(preview);
  const sourceText = html.toString('utf8');
  const csp = sourceText.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  assert.ok(csp, 'offline preview CSP must exist before serving');

  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    if (request.method !== 'GET' || request.url !== '/dadyar-preview/') {
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(html.length),
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    });
    response.end(html);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(baseUrl + '/dadyar-preview/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  const servedCsp = response.headers.get('content-security-policy');
  assert.equal(servedCsp, csp, 'HTTP response must enforce the exact CSP from the reviewed document');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(servedCsp.split(';').some(part => part.trim() === directive), 'HTTP CSP is missing ' + directive);
  }
  assert.equal(response.headers.get('cache-control'), 'no-store', 'synthetic case content must not be cached by the preview response');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(await response.text(), sourceText, 'HTTP route must serve the exact reviewed HTML bytes');

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-mobile-http-'));
  const downloadDir = path.join(userData, 'downloads');
  fs.mkdirSync(downloadDir);
  const portFile = path.join(userData, 'DevToolsActivePort');
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--user-data-dir=' + userData,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
  let client;

  t.after(async () => {
    if (client?.socket?.readyState === WebSocket.OPEN) client.socket.close();
    signalChromiumTree(child, 'SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => {
        signalChromiumTree(child, 'SIGKILL');
        resolve();
      }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    fs.rmSync(userData, { recursive: true, force: true });
  });

  const port = await waitForDevToolsPort(portFile, child);
  const endpoint = 'http://127.0.0.1:' + port + '/json/list';
  let targets = [];
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const targetResponse = await fetch(endpoint);
      if (targetResponse.ok) {
        targets = await targetResponse.json();
        if (targets.some(target => target.type === 'page' && target.webSocketDebuggerUrl)) break;
      }
    } catch {}
    await delay(50);
  }
  const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
  assert.ok(page, 'Chromium page target unavailable. ' + stderr);
  client = createCdpClient(page.webSocketDebuggerUrl);
  await client.opened;

  const remoteRequests = [];
  client.on('Network.requestWillBeSent', event => {
    const url = event.request?.url || '';
    if (/^(?:https?|wss?):/i.test(url) && !/^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(url)) {
      remoteRequests.push(url);
    }
  });

  await client.command('Page.enable');
  await client.command('Runtime.enable');
  await client.command('Network.enable');
  await client.command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await client.command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('HTTP preview load event timed out')), 8000);
    client.on('Page.loadEventFired', () => { clearTimeout(timer); resolve(); });
  });
  const navigation = await client.command('Page.navigate', { url: baseUrl + '/dadyar-preview/' });
  assert.ok(!navigation.errorText, navigation.errorText || 'HTTP preview navigation failed');
  await loaded;
  await delay(150);

  async function evaluate(expression) {
    const result = await client.command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.text || 'browser evaluation failed');
    return result.result?.value;
  }

  async function tap(id) {
    const safeId = JSON.stringify(id);
    await evaluate('document.getElementById(' + safeId + ').scrollIntoView({block:"center"}); true');
    const rect = await evaluate('(() => { const r=document.getElementById(' + safeId + ').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()');
    assert.ok(rect && rect.width > 0 && rect.height > 0, 'touch target is not visible: ' + id);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await client.command('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
    });
    await client.command('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await delay(120);
  }

  const initial = await evaluate('({path:location.pathname,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,csp:document.querySelector("meta[http-equiv=Content-Security-Policy]")?.content||"",downloadInitiallyDisabled:document.getElementById("download").disabled})');
  assert.equal(initial.path, '/dadyar-preview/');
  assert.equal(initial.width, 390);
  assert.ok(initial.scrollWidth <= initial.width + 1, 'mobile page has horizontal overflow');
  assert.equal(initial.csp, csp);
  assert.equal(initial.downloadInitiallyDisabled, true);

  // Supply a coherent, fully answered synthetic cheque fixture before review.
  // The selected evidence defaults include an unknown due date and settlement
  // claim, so these answers avoid creating a contradictory draft.
  await evaluate(`(() => {
    for (const [id, value] of [['issue-date', 'no'], ['certificate', 'no'], ['defense', 'yes']]) {
      const control = document.getElementById(id);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  })()`);
  await tap('generate');
  const generated = await evaluate('({visible:!document.getElementById("result").hidden,focusedResult:document.activeElement?.id==="result",reportPresent:document.getElementById("report").textContent.length>0,downloadDisabled:document.getElementById("download").disabled,exportEligible})');
  assert.equal(generated.visible, true, 'real touch did not generate the local draft');
  assert.equal(generated.focusedResult, true, 'focus must move to the generated result for keyboard and screen-reader users');
  assert.equal(generated.reportPresent, true);
  assert.equal(generated.exportEligible, true, 'synthetic cheque fixture must be internally consistent before review');
  assert.equal(generated.downloadDisabled, true, 'report must remain blocked until the local review flow is completed');

  // Exercise the complete local human-review boundary on the mobile page.
  // The reviewer identity remains a fixed synthetic label; this is not
  // authenticated review and must never be represented as release approval.
  await client.command('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir
  });

  await evaluate(`(() => {
    const decision = document.getElementById('review-decision');
    decision.value = 'rejected';
    decision.dispatchEvent(new Event('change', { bubbles: true }));
    const note = document.getElementById('review-note');
    note.value = 'رد نمونه به علت نقص مدرک ساختگی';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  for (const id of ['review-check-facts', 'review-check-conflicts', 'review-check-sources', 'review-check-privacy']) {
    await tap(id);
  }
  await tap('export-ack');
  const rejectedReady = await evaluate('({recordDisabled:document.getElementById("record-review").disabled,downloadDisabled:document.getElementById("download").disabled})');
  assert.equal(rejectedReady.recordDisabled, false, 'complete rejected review must be recordable');
  await tap('record-review');

  let rejectedState = null;
  const rejectedDeadline = Date.now() + 5000;
  while (Date.now() < rejectedDeadline) {
    rejectedState = await evaluate('({status:document.getElementById("review-status").textContent,downloadDisabled:document.getElementById("download").disabled})');
    if (rejectedState.status.includes('بازبینی رد شد')) break;
    await delay(50);
  }
  assert.ok(rejectedState?.status.includes('بازبینی رد شد'), 'rejected review did not finish');
  assert.equal(rejectedState.downloadDisabled, true, 'rejected review must never unlock report download');

  await evaluate(`(() => {
    const decision = document.getElementById('review-decision');
    decision.value = 'approved';
    decision.dispatchEvent(new Event('change', { bubbles: true }));
    const note = document.getElementById('review-note');
    note.value = 'تأیید نمونه پس از بررسی داده ساختگی';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await tap('export-ack');
  const approvedReady = await evaluate('({recordDisabled:document.getElementById("record-review").disabled,downloadDisabled:document.getElementById("download").disabled,reviewer:document.getElementById("reviewer-name").value})');
  assert.equal(approvedReady.reviewer, 'بازبین آزمون', 'reviewer label must remain synthetic');
  assert.equal(approvedReady.recordDisabled, false, 'approved review must require the full checklist and local acknowledgement');
  assert.equal(approvedReady.downloadDisabled, true, 'approval is not complete until the review record is committed');
  await tap('record-review');

  let approvedState = null;
  const approvedDeadline = Date.now() + 5000;
  while (Date.now() < approvedDeadline) {
    approvedState = await evaluate('({status:document.getElementById("review-status").textContent,downloadDisabled:document.getElementById("download").disabled})');
    if (approvedState.status.includes('بازبینی انسانی با اظهار بازبین ثبت شد')) break;
    await delay(50);
  }
  assert.ok(approvedState?.status.includes('بازبینی انسانی با اظهار بازبین ثبت شد'), 'approved review did not finish');
  assert.equal(approvedState.downloadDisabled, false, 'only the exact reviewed report may be downloaded');

  await tap('download');
  let downloadedPath = '';
  const downloadDeadline = Date.now() + 7000;
  while (Date.now() < downloadDeadline) {
    const names = fs.readdirSync(downloadDir);
    const candidate = names.find(name => name === 'dadyar-synthetic-cheque.txt');
    if (candidate && !names.some(name => name.endsWith('.crdownload'))) {
      downloadedPath = path.join(downloadDir, candidate);
      break;
    }
    await delay(50);
  }
  assert.ok(downloadedPath, 'approved synthetic report file was not downloaded');
  const downloadedReport = fs.readFileSync(downloadedPath, 'utf8');
  assert.match(downloadedReport, /دادیار \| چک صرفاً فرضی \| نسخه آزمایشی آفلاین/);
  assert.match(downloadedReport, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
  assert.match(downloadedReport, /نام بازبین: بازبین آزمون/);
  assert.match(downloadedReport, /نتیجه بازبینی: تأیید محلی برای دریافت گزارش آزمایشی/);
  assert.match(downloadedReport, /SHA-256 پیش‌نویس بازبینی‌شده: [a-f0-9]{64}/);
  assert.match(downloadedReport, /یادداشت بازبین: تأیید نمونه پس از بررسی داده ساختگی/);
  const consumed = await evaluate('({downloadDisabled:document.getElementById("download").disabled,acknowledgementCleared:!document.getElementById("export-ack").checked,checklistCleared:Array.from(document.querySelectorAll("#review-checklist input[type=checkbox]")).every(item=>!item.checked),decisionReset:document.getElementById("review-decision").value==="pending",noteCleared:document.getElementById("review-note").value==="",status:document.getElementById("review-status").textContent})');
  assert.equal(consumed.downloadDisabled, true, 'a successful download must consume the approval');
  assert.equal(consumed.acknowledgementCleared, true);
  assert.equal(consumed.checklistCleared, true);
  assert.equal(consumed.decisionReset, true);
  assert.equal(consumed.noteCleared, true);
  assert.match(consumed.status, /گزارش دریافت شد/);

  await tap('reset');
  const reset = await evaluate('({resultHidden:document.getElementById("result").hidden,downloadDisabled:document.getElementById("download").disabled,questionCleared:document.getElementById("free-question").value==="",evidenceCleared:Array.from(document.querySelectorAll("#evidence-list input[type=checkbox]")).every(item=>!item.checked)})');
  assert.equal(reset.resultHidden, true, 'touch reset did not clear the local draft');
  assert.equal(reset.downloadDisabled, true);
  assert.equal(reset.questionCleared, true);
  assert.equal(reset.evidenceCleared, true);
  assert.deepEqual(remoteRequests, [], 'preview must not make external HTTP(S), WebSocket or API requests');
  const unexpectedLocalRequests = requests.filter(item =>
    !(item.method === 'GET' && (item.url === '/dadyar-preview/' || item.url === '/favicon.ico'))
  );
  assert.deepEqual(unexpectedLocalRequests, [], 'preview must not make same-origin API or other unexpected requests');
  assert.equal(requests.filter(item => item.method === 'GET' && item.url === '/dadyar-preview/').length, 2,
    'only the initial fetch and the mobile page navigation may request the preview document');
});
