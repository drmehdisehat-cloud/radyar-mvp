'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false)
  ]);
}
function signalChromiumTree(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

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

  function waitFor(method, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('CDP event timed out: ' + method)), timeoutMs);
      on(method, params => {
        clearTimeout(timer);
        resolve(params);
      });
    });
  }

  return { socket, opened, command, on, waitFor };
}

test('Dadyar preview uses real Chromium mobile device emulation and preserves offline human-review flow', { timeout: 25000 }, async t => {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  const chrome = candidates.find(candidate => fs.existsSync(candidate));
  if (!chrome) {
    if (process.env.CI === 'true') assert.fail('Chromium required for mobile device-emulation gate');
    return t.skip('Chromium unavailable locally');
  }

  const preview = path.resolve(__dirname, '../dadyar-preview/index.html');
  assert.ok(fs.statSync(preview).isFile(), 'offline preview source missing');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-cdp-mobile-'));
  const portFile = path.join(userData, 'DevToolsActivePort');
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--user-data-dir=' + userData,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1500); });
  let client;

  try {
    const port = await waitForDevToolsPort(portFile, child);
    const endpoint = 'http://127.0.0.1:' + port + '/json/list';
    let targets = [];
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          targets = await response.json();
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
      if (/^(?:https?|wss?):/i.test(event.request?.url || '')) remoteRequests.push(event.request.url);
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
    await client.command('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone'
    });

    const loaded = client.waitFor('Page.loadEventFired');
    const navigation = await client.command('Page.navigate', { url: pathToFileURL(preview).href });
    assert.ok(!navigation.errorText, navigation.errorText || 'preview navigation failed');
    await loaded;
    await delay(200);

    const expression = [
      '(() => {',
      '  const root = document.documentElement;',
      '  const download = document.getElementById("download");',
      '  const initialDisabled = download.disabled;',
      '  for (const [id, value] of [["issue-date","yes"],["certificate","no"],["defense","yes"]]) {',
      '    const control = document.getElementById(id);',
      '    control.value = value;',
      '    control.dispatchEvent(new Event("change", { bubbles: true }));',
      '  }',
      '  document.getElementById("generate").click();',
      '  const blockedBeforeAcknowledgement = download.disabled;',
      '  const reviewer = document.getElementById("reviewer-name");',
      '  reviewer.value = "بازبین آزمون"; reviewer.dispatchEvent(new Event("input", { bubbles: true }));',
      '  const decision = document.getElementById("review-decision");',
      '  decision.value = "approved"; decision.dispatchEvent(new Event("change", { bubbles: true }));',
      '  const note = document.getElementById("review-note");',
      '  note.value = "بازبینی داده ساختگی"; note.dispatchEvent(new Event("input", { bubbles: true }));',
      '  document.getElementById("export-ack").click();',
      '  document.getElementById("record-review").click();',
      '  const enabledAfterHumanReview = !download.disabled;',
      '  const reviewStatus = document.getElementById("review-status").textContent;',
      '  const reportAfterAcknowledgement = document.getElementById("report").textContent;',
      '  const question = document.getElementById("free-question");',
      '  question.value = "چک و مهریه در این مثال چه موضوعاتی هستند؟";',
      '  question.dispatchEvent(new Event("input", { bubbles: true }));',
      '  const staleDraftInvalidated = download.disabled && document.getElementById("result").hidden;',
      '  document.getElementById("generate").click();',
      '  const multiTopicIds = classifyQuestion(question.value).map(item => item.id);',
      '  const multiTopicReport = document.getElementById("report").textContent;',
      '  const multiTopicExportEligible = exportEligible;',
      '  const multiTopicExportStatus = document.getElementById("export-status").textContent;',
      '  const externalResources = performance.getEntriesByType("resource").map(entry => entry.name).filter(url => /^(?:https?|wss?):/i.test(url));',
      '  return {',
      '    width: innerWidth, height: innerHeight, screenWidth: screen.width, devicePixelRatio,',
      '    maxTouchPoints: navigator.maxTouchPoints, coarsePointer: matchMedia("(pointer: coarse)").matches,',
      '    mobileUserAgent: /iPhone|Mobile/i.test(navigator.userAgent),',
      '    horizontalOverflow: root.scrollWidth > root.clientWidth + 1,',
      '    initialDisabled, blockedBeforeAcknowledgement, enabledAfterHumanReview, reviewStatus,',
      '    reportAfterAcknowledgement, staleDraftInvalidated, multiTopicReport, multiTopicIds,',
      '    multiTopicExportEligible, multiTopicExportStatus,',
      '    csp: document.querySelector("meta[http-equiv]")?.content || "",',
      '    externalResources',
      '  };',
      '})()'
    ].join('\n');
    const evaluated = await client.command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    assert.ok(!evaluated.exceptionDetails, evaluated.exceptionDetails?.text || 'mobile preview script threw');
    const snapshot = evaluated.result?.value;
    assert.ok(snapshot, 'mobile preview snapshot missing');
    assert.equal(snapshot.width, 390, 'CSS viewport width was not emulated');
    assert.equal(snapshot.height, 844, 'CSS viewport height was not emulated');
    assert.equal(snapshot.screenWidth, 390, 'device screen width was not emulated');
    assert.equal(snapshot.devicePixelRatio, 3, 'device pixel ratio was not emulated');
    assert.ok(snapshot.maxTouchPoints >= 1, 'touch input was not emulated');
    assert.equal(snapshot.coarsePointer, true, 'coarse pointer media query did not activate');
    assert.equal(snapshot.mobileUserAgent, true, 'mobile user agent override did not apply');
    assert.equal(snapshot.horizontalOverflow, false, 'mobile layout has horizontal overflow');
    assert.equal(snapshot.initialDisabled, true, 'download was initially enabled');
    assert.equal(snapshot.blockedBeforeAcknowledgement, true, 'report exported before human acknowledgement');
    assert.equal(snapshot.enabledAfterHumanReview, true, 'approved human review did not enable report download');
    assert.match(snapshot.reviewStatus, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
    assert.match(snapshot.reportAfterAcknowledgement, /منابع قانونی: تأییدنشده/);
    assert.equal(snapshot.staleDraftInvalidated, true, 'editing free question retained a stale draft');
    assert.ok(snapshot.multiTopicIds.includes('instruments'), 'cheque hint missing from internal multi-topic routing');
    assert.ok(snapshot.multiTopicIds.includes('family'), 'family hint missing from internal multi-topic routing');
    assert.equal(snapshot.multiTopicExportEligible, true,
      'a free question containing cheque plus another topic must remain eligible for the cheque-only synthetic report');
    assert.match(snapshot.multiTopicExportStatus, /چندموضوعی/,
      'the user must be told that non-cheque topics are not analyzed in this preview');
    assert.doesNotMatch(snapshot.multiTopicReport, /دسته‌بندی داخلی:|برچسب‌های موضوعی پیشنهادی/);
    for (const topicId of snapshot.multiTopicIds) {
      assert.equal(snapshot.multiTopicReport.includes(topicId), false,
        'internal topic identifier leaked into the user-facing report: ' + topicId);
    }
    assert.match(snapshot.csp, /connect-src 'none'/);
    assert.deepEqual(snapshot.externalResources, []);
    assert.deepEqual(remoteRequests, [], 'preview attempted a remote network request');
  } finally {
    try { client?.socket.close(); } catch {}
    // Chromium may leave renderer/zygote children holding profile files after its
    // browser parent exits. Terminate the isolated process group before removing it.
    if (child.exitCode === null && child.signalCode === null) {
      signalChromiumTree(child, 'SIGTERM');
      await waitForChildExit(child, 1500);
    }
    // Kill any remaining descendants in the detached process group, even if the
    // browser parent has already exited.
    if (process.platform !== 'win32' && child.pid) {
      signalChromiumTree(child, 'SIGKILL');
    } else if (child.exitCode === null && child.signalCode === null) {
      signalChromiumTree(child, 'SIGKILL');
    }
    await waitForChildExit(child, 1000);
    await delay(100);
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
