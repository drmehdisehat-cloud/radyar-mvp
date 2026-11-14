'use strict';
const test = require('node:test');
const http = require('node:http');
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

async function waitForDevToolsPort(file, child, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error('Chromium exited before DevTools became ready (code=' + child.exitCode + ', signal=' + child.signalCode + ')');
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

test('Dadyar preview uses real Chromium mobile device emulation and preserves offline human-review flow', { timeout: 45000 }, async t => {
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
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--user-data-dir=' + userData,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1500); });
  let client;

  try {
    const port = await waitForDevToolsPort(portFile, child).catch(error => { throw Error(error.message + '; Chromium stderr: ' + stderr); });
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
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
      source: [
        'URL.createObjectURL = blob => { window.__dadyarExportBlob = blob; return "blob:dadyar-test-export"; };',
        'URL.revokeObjectURL = () => {};',
        'HTMLAnchorElement.prototype.click = function() { window.__dadyarDownloadName = this.download; };'
      ].join('\n')
    });
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
      '(async () => {',
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
      '  const note = document.getElementById("review-note");',
      '  decision.value = "rejected"; decision.dispatchEvent(new Event("change", { bubbles: true }));',
      '  note.value = "بازبینی رد شده برای آزمون"; note.dispatchEvent(new Event("input", { bubbles: true }));',
      '  document.getElementById("export-ack").click();',
      '  document.getElementById("record-review").click();',
      '  const rejectedReviewKeepsExportBlocked = download.disabled;',
      '  const rejectedReviewStatus = document.getElementById("review-status").textContent;',
      '  decision.value = "approved"; decision.dispatchEvent(new Event("change", { bubbles: true }));',
      '  note.value = "بازبینی داده ساختگی"; note.dispatchEvent(new Event("input", { bubbles: true }));',
      '  document.getElementById("export-ack").click();',
      '  document.getElementById("record-review").click();',
      '  const enabledAfterHumanReview = !download.disabled',
      '  const reviewStatus = document.getElementById("review-status").textContent;',
      '  const exportEnabledBeforeDownload = !download.disabled;',
      '  download.click();',
      '  const exportBlob = window.__dadyarExportBlob;',
      '  const exportedReport = exportBlob ? await exportBlob.text() : "";',
      '  const exportedFilename = window.__dadyarDownloadName || "";',
      '  const approvalConsumed = download.disabled && !document.getElementById("export-ack").checked;',
      '  window.__dadyarExportBlob = null; window.__dadyarDownloadName = "";',
      '  download.click();',
      '  const repeatExportBlocked = window.__dadyarExportBlob === null && download.disabled;',
      '  const reviewerClearedAfterDownload = reviewer.value === "" && note.value === "" && decision.value === "pending";',
      '  document.getElementById("export-ack").click();',
      '  const reapprovalBlockedWithoutFreshDetails = document.getElementById("record-review").disabled && download.disabled;',
      '  const postDownloadReviewStatus = document.getElementById("review-status").textContent;',
      '  const reportAfterAcknowledgement = document.getElementById("report").textContent;',
      '  const question = document.getElementById("free-question");',
      '  question.value = "پرسش فرضی که هنوز ثبت نشده است";',
      '  window.dispatchEvent(new PageTransitionEvent("pagehide"));',
      '  const pagehideClearedUnsubmittedQuestion = question.value === "";',
      '  const pagehideClearedDraft = document.getElementById("result").hidden && download.disabled;',
      '  const pagehideClearedReviewer = document.getElementById("reviewer-name").value === "" && document.getElementById("review-note").value === "";',
      '  const pagehideClearedSelections = document.getElementById("role").selectedIndex === 0 && Array.from(document.querySelectorAll("#interview select")).every(control => control.selectedIndex === 0) && Array.from(document.querySelectorAll("fieldset input[type=checkbox]")).every(control => !control.checked);',
      '  const pagehideClearedReviewApproval = document.getElementById("review-decision").value === "pending" && !document.getElementById("export-ack").checked && document.getElementById("record-review").disabled;',
      '  const sampleEvidence = document.querySelectorAll("fieldset input[type=checkbox]"); sampleEvidence[0].checked = true; sampleEvidence[2].checked = true;',
      '  for (const [id,value] of [["issue-date","yes"],["certificate","no"],["defense","yes"]]) { const control = document.getElementById(id); control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); }',
      '  const multiTopicRawQuestion = "چک و مهریه در این مثال چه موضوعاتی هستند؟";',
      '  question.value = multiTopicRawQuestion;',
      '  question.dispatchEvent(new Event("input", { bubbles: true }));',
      '  const staleDraftInvalidated = download.disabled && document.getElementById("result").hidden;',
      '  const multiTopicIds = classifyQuestion(question.value).map(item => item.id);',
      '  document.getElementById("generate").click();',
      '  const multiTopicInputCleared = question.value === "";',
      '  const multiTopicRawQuestionEchoed = document.getElementById("report").textContent.includes(multiTopicRawQuestion);',
      '  const multiTopicReport = document.getElementById("report").textContent;',
      '  const multiTopicExportEligible = exportEligible;',
      '  const multiTopicScopeStatus = document.getElementById("topic-scope-status").textContent;',
      '  const externalResources = performance.getEntriesByType("resource").map(entry => entry.name).filter(url => /^(?:https?|wss?):/i.test(url));',
      '  return {',
      '    width: innerWidth, height: innerHeight, screenWidth: screen.width, devicePixelRatio,',
      '    maxTouchPoints: navigator.maxTouchPoints, coarsePointer: matchMedia("(pointer: coarse)").matches,',
      '    mobileUserAgent: /iPhone|Mobile/i.test(navigator.userAgent),',
      '    horizontalOverflow: root.scrollWidth > root.clientWidth + 1,',
      '    initialDisabled, blockedBeforeAcknowledgement, rejectedReviewKeepsExportBlocked, rejectedReviewStatus, enabledAfterHumanReview, reviewStatus,',
      '    exportEnabledBeforeDownload, exportedReport, exportedFilename, approvalConsumed, repeatExportBlocked,',
      '    reviewerClearedAfterDownload, reapprovalBlockedWithoutFreshDetails, postDownloadReviewStatus,',
      '    reportAfterAcknowledgement, staleDraftInvalidated, multiTopicReport, multiTopicIds,',
      '    pagehideClearedUnsubmittedQuestion, pagehideClearedDraft, pagehideClearedReviewer, pagehideClearedSelections, pagehideClearedReviewApproval,',
      '    multiTopicExportEligible, multiTopicScopeStatus, multiTopicInputCleared, multiTopicRawQuestionEchoed,',
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
    assert.equal(snapshot.rejectedReviewKeepsExportBlocked, true, 'a rejected human review enabled report download');
    assert.match(snapshot.rejectedReviewStatus, /بازبینی رد شد/);
    assert.equal(snapshot.enabledAfterHumanReview, true, 'approved human review did not enable report download');
    assert.match(snapshot.reviewStatus, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
    assert.equal(snapshot.exportEnabledBeforeDownload, true, 'approved local review did not enable the report download');
    assert.equal(snapshot.exportedFilename, 'dadyar-synthetic-cheque.txt');
    assert.match(snapshot.exportedReport, /ثبت بازبینی انسانی \(اظهار محلی؛ هویت احراز نشده\)/);
    assert.match(snapshot.exportedReport, /نام بازبین: بازبین آزمون/);
    assert.match(snapshot.exportedReport, /نتیجه بازبینی: تأیید برای دریافت آموزشی/);
    assert.match(snapshot.exportedReport, /یادداشت بازبین: بازبینی داده ساختگی/);
    assert.match(snapshot.exportedReport, /این اظهار محلی است و تأیید حقوقی یا احراز هویت محسوب نمی‌شود/);
    assert.equal(snapshot.approvalConsumed, true, 'approval was not consumed after report download');
    assert.equal(snapshot.repeatExportBlocked, true, 'a second report download was allowed without a fresh review');
    assert.equal(snapshot.reviewerClearedAfterDownload, true, 'reviewer identity label or note remained after export');
    assert.equal(snapshot.reapprovalBlockedWithoutFreshDetails, true, 'the same local review details could be reused after export');
    assert.match(snapshot.postDownloadReviewStatus, /از ابتدا/);
    assert.match(snapshot.reportAfterAcknowledgement, /منابع قانونی: تأییدنشده/);
    assert.equal(snapshot.staleDraftInvalidated, true, 'editing free question retained a stale draft');
    assert.equal(snapshot.pagehideClearedUnsubmittedQuestion, true, 'pagehide retained an unsubmitted free question');
    assert.equal(snapshot.pagehideClearedDraft, true, 'pagehide retained a previously generated draft');
    assert.equal(snapshot.pagehideClearedReviewer, true, 'pagehide retained local reviewer details');
    assert.equal(snapshot.pagehideClearedSelections, true, 'pagehide retained role, interview answers, or selected evidence');
    assert.equal(snapshot.pagehideClearedReviewApproval, true, 'pagehide retained a local review approval');
    assert.ok(snapshot.multiTopicIds.includes('instruments'), 'cheque hint missing from internal multi-topic routing');
    assert.ok(snapshot.multiTopicIds.includes('family'), 'family hint missing from internal multi-topic routing');
    assert.equal(snapshot.multiTopicExportEligible, false,
      'a mixed-topic free question must be blocked by the cheque-only preview scope');
    assert.equal(snapshot.multiTopicInputCleared, true, 'raw free text remained in the editable field after local routing');
    assert.equal(snapshot.multiTopicRawQuestionEchoed, false, 'raw free text was copied into the report');
    assert.match(snapshot.multiTopicReport, /متن خام پرسش آزاد برای حفظ حریم خصوصی در گزارش درج نمی‌شود/);
    assert.match(snapshot.multiTopicScopeStatus, /چندموضوعی/,
      'the user must be told that non-cheque topics are not analyzed in this preview');
    assert.match(snapshot.multiTopicScopeStatus, /موضوع دیگر را تحلیل نمی‌کند/,
      'the multi-topic scope limitation must remain explicit');
    assert.doesNotMatch(snapshot.multiTopicReport, /دسته‌بندی داخلی:|برچسب‌های موضوعی پیشنهادی/);
    for (const topicId of snapshot.multiTopicIds) {
      assert.equal(snapshot.multiTopicReport.includes(topicId), false,
        'internal topic identifier leaked into the user-facing report: ' + topicId);
    }
    assert.match(snapshot.csp, /connect-src 'none'/);
    assert.deepEqual(snapshot.externalResources, []);
    assert.deepEqual(remoteRequests, [], 'preview attempted a remote network request');
    // Repeat layout checks on a compact 320x568 handset viewport. The 390px
    // iPhone run above is not sufficient to catch narrow-screen overflow.
    await client.command('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 568,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 320,
      screenHeight: 568
    });
    const narrowResult = await client.command('Runtime.evaluate', {
      expression: '(() => { const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; }; const controls = Array.from(document.querySelectorAll("button, select")).filter(visible).map(el => ({ id: el.id, height: el.getBoundingClientRect().height })); const checkboxes = Array.from(document.querySelectorAll("input[type=checkbox]")).filter(visible).map(el => ({ id: el.id || el.value, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })); return { width: innerWidth, height: innerHeight, screenWidth: screen.width, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, shortControls: controls.filter(item => item.height < 44), smallCheckboxes: checkboxes.filter(item => item.width < 22 || item.height < 22) }; })()',
      returnByValue: true
    });
    assert.ok(!narrowResult.exceptionDetails, narrowResult.exceptionDetails?.text || 'narrow mobile layout evaluation failed');
    const narrow = narrowResult.result?.value;
    assert.ok(narrow, 'narrow mobile layout snapshot missing');
    assert.equal(narrow.width, 320, 'compact CSS viewport width was not emulated');
    assert.equal(narrow.height, 568, 'compact CSS viewport height was not emulated');
    assert.equal(narrow.screenWidth, 320, 'compact device screen width was not emulated');
    assert.equal(narrow.horizontalOverflow, false, 'compact mobile layout has horizontal overflow');
    assert.deepEqual(narrow.shortControls, [], 'visible buttons/selects must retain a 44px touch target');
    assert.deepEqual(narrow.smallCheckboxes, [], 'visible checkboxes must retain a 22px touch target');
    assert.deepEqual(remoteRequests, [], 'compact viewport caused a remote network request');
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


test('Dadyar mobile preview serves the exact HTTP subpath, downloads only after local human review, and makes no API calls', { timeout: 35000 }, async t => {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  const chrome = candidates.find(candidate => fs.existsSync(candidate));
  if (!chrome) {
    if (process.env.CI === 'true') assert.fail('Chromium required for HTTP subpath and report-download gate');
    return t.skip('Chromium unavailable locally');
  }

  const preview = path.resolve(__dirname, '../dadyar-preview/index.html');
  const html = fs.readFileSync(preview);
  const metaCsp = html.toString('utf8').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(metaCsp, 'offline preview CSP metadata missing');
  const responseCsp = metaCsp + "; frame-ancestors 'none'";
  const unexpectedPaths = [];
  const apiPaths = [];
  const previewServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/dadyar-preview/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': responseCsp,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
      });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && req.url === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    const entry = req.method + ' ' + req.url;
    unexpectedPaths.push(entry);
    if (req.url.startsWith('/api/')) apiPaths.push(entry);
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end();
  });

  await new Promise((resolve, reject) => {
    previewServer.once('error', reject);
    previewServer.listen(0, '127.0.0.1', resolve);
  });
  const port = previewServer.address().port;
  const previewUrl = 'http://127.0.0.1:' + port + '/dadyar-preview/';
  const faviconUrl = 'http://127.0.0.1:' + port + '/favicon.ico';
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-http-download-'));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-http-mobile-'));
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
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
  let client;
  try {
    const portNumber = await waitForDevToolsPort(portFile, child);
    const endpoint = 'http://127.0.0.1:' + portNumber + '/json/list';
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
    let previewResponse = null;
    client.on('Network.requestWillBeSent', event => {
      const url = event.request?.url || '';
      if (/^(?:https?|wss?):/i.test(url) && url !== previewUrl && url !== faviconUrl) remoteRequests.push(url);
    });
    client.on('Network.responseReceived', event => {
      if (event.response?.url === previewUrl) {
        previewResponse = { status: event.response.status, headers: event.response.headers || {} };
      }
    });

    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Network.enable');
    await client.command('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await client.command('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
      screenWidth: 390, screenHeight: 844
    });
    await client.command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await client.command('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone'
    });

    const loaded = client.waitFor('Page.loadEventFired');
    const navigation = await client.command('Page.navigate', { url: previewUrl });
    assert.ok(!navigation.errorText, navigation.errorText || 'HTTP preview navigation failed');
    await loaded;
    await delay(150);

    const expression = [
      '(() => {',
      '  const root = document.documentElement;',
      '  const download = document.getElementById("download");',
      '  const initiallyDisabled = download.disabled;',
      '  for (const [id, value] of [["issue-date","yes"],["certificate","no"],["defense","yes"]]) {',
      '    const control = document.getElementById(id);',
      '    control.value = value;',
      '    control.dispatchEvent(new Event("change", { bubbles: true }));',
      '  }',
      '  const question = document.getElementById("free-question");',
      '  const multiTopicRawQuestion = "چک و مهریه در این مثال چه موضوعاتی هستند؟";',
      '  question.value = multiTopicRawQuestion;',
      '  question.dispatchEvent(new Event("input", { bubbles: true }));',
      '  const multiTopicIds = classifyQuestion(question.value).map(item => item.id);',
      '  document.getElementById("generate").click();',
      '  const multiTopicInputCleared = question.value === "";',
      '  const multiTopicRawQuestionEchoed = document.getElementById("report").textContent.includes(multiTopicRawQuestion);',
      '  const multiTopicExportEligible = exportEligible;',
      '  const multiTopicScopeStatus = document.getElementById("topic-scope-status").textContent;',
      '  const blockedBeforeReview = download.disabled;',
      '  question.value = "چک صیادی و گواهی عدم پرداخت";',
      '  question.dispatchEvent(new Event("input", { bubbles: true }));',
      '  document.getElementById("generate").click();',
      '  const chequeOnlyExportEligible = exportEligible;',
      '  const reviewer = document.getElementById("reviewer-name");',
      '  reviewer.value = "بازبین آزمون"; reviewer.dispatchEvent(new Event("input", { bubbles: true }));',
      '  const decision = document.getElementById("review-decision");',
      '  decision.value = "approved"; decision.dispatchEvent(new Event("change", { bubbles: true }));',
      '  const note = document.getElementById("review-note");',
      '  note.value = "بازبینی داده ساختگی"; note.dispatchEvent(new Event("input", { bubbles: true }));',
      '  document.getElementById("export-ack").click();',
      '  document.getElementById("record-review").click();',
      '  const enabledAfterReview = !download.disabled;',
      '  const reviewStatus = document.getElementById("review-status").textContent;',
      '  const visibleReport = document.getElementById("report").textContent;',
      '  download.click();',
      '  const disabledAfterExport = download.disabled;',
      '  const sensitiveRawQuestion = "چک فرضی با شماره تماس 09123456789";',
      '  question.value = sensitiveRawQuestion;',
      '  question.dispatchEvent(new Event("input", { bubbles: true }));',
      '  document.getElementById("generate").click();',
      '  const sensitiveInputCleared = question.value === "";',
      '  const sensitiveRawQuestionEchoed = document.getElementById("report").textContent.includes("09123456789");',
      '  const sensitiveVisibleReport = document.getElementById("report").textContent;',
      '  const sensitiveExportBlocked = download.disabled && !exportEligible;',
      '  const sensitiveStatus = document.getElementById("export-status").textContent;',
      '  const allowedDocumentUrl = ' + JSON.stringify(previewUrl) + ';',
      '  const allowedFaviconUrl = ' + JSON.stringify(faviconUrl) + ';',
      '  const resourceRequests = performance.getEntriesByType("resource").map(entry => entry.name).filter(url => /^(?:https?|wss?):/i.test(url) && url !== allowedDocumentUrl && url !== allowedFaviconUrl);',
      '  return {',
      '    width: innerWidth, height: innerHeight, screenWidth: screen.width, devicePixelRatio,',
      '    maxTouchPoints: navigator.maxTouchPoints, coarsePointer: matchMedia("(pointer: coarse)").matches,',
      '    mobileUserAgent: /iPhone|Mobile/i.test(navigator.userAgent),',
      '    horizontalOverflow: root.scrollWidth > root.clientWidth + 1,',
      '    initiallyDisabled, blockedBeforeReview, enabledAfterReview, disabledAfterExport,',
      '    multiTopicIds, multiTopicInputCleared, multiTopicRawQuestionEchoed, multiTopicExportEligible, multiTopicScopeStatus, chequeOnlyExportEligible,',
      '    sensitiveInputCleared, sensitiveRawQuestionEchoed, sensitiveVisibleReport, sensitiveExportBlocked, sensitiveStatus,',
      '    reviewStatus, visibleReport, resourceRequests',
      '  };',
      '})()'
    ].join('\n');
    const evaluated = await client.command('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    assert.ok(!evaluated.exceptionDetails, evaluated.exceptionDetails?.text || 'mobile HTTP preview script threw');
    const snapshot = evaluated.result?.value;
    assert.ok(snapshot, 'mobile HTTP preview snapshot missing');
    assert.equal(snapshot.width, 390);
    assert.equal(snapshot.height, 844);
    assert.equal(snapshot.screenWidth, 390);
    assert.equal(snapshot.devicePixelRatio, 3);
    assert.ok(snapshot.maxTouchPoints >= 1);
    assert.equal(snapshot.coarsePointer, true);
    assert.equal(snapshot.mobileUserAgent, true);
    assert.equal(snapshot.horizontalOverflow, false);
    assert.equal(snapshot.initiallyDisabled, true);
    assert.equal(snapshot.blockedBeforeReview, true);
    assert.equal(snapshot.enabledAfterReview, true);
    assert.equal(snapshot.disabledAfterExport, true, 'export must consume the local review acknowledgement');
    assert.ok(snapshot.multiTopicIds.includes('instruments'), 'cheque hint missing from HTTP preview routing');
    assert.ok(snapshot.multiTopicIds.includes('family'), 'family hint missing from HTTP preview routing');
    assert.equal(snapshot.multiTopicInputCleared, true, 'raw multi-topic question remained in the editable field');
    assert.equal(snapshot.multiTopicRawQuestionEchoed, false, 'raw multi-topic question leaked into the report');
    assert.equal(snapshot.multiTopicExportEligible, false, 'mixed-topic input must be blocked in the cheque-only preview');
    assert.equal(snapshot.chequeOnlyExportEligible, true, 'a cheque-only question should remain eligible for human review');
    assert.match(snapshot.multiTopicScopeStatus, /چندموضوعی/);
    assert.equal(snapshot.sensitiveInputCleared, true, 'sensitive free text remained in the editable field');
    assert.equal(snapshot.sensitiveRawQuestionEchoed, false, 'sensitive phone number leaked into the report');
    assert.doesNotMatch(snapshot.sensitiveVisibleReport, /09123456789/);
    assert.equal(snapshot.sensitiveExportBlocked, true, 'sensitive free text must block report export');
    assert.match(snapshot.sensitiveStatus, /شناسه حساس/);
    assert.match(snapshot.reviewStatus, /هویت بازبین در این نسخه آفلاین احراز نمی‌شود/);
    assert.match(snapshot.visibleReport, /منابع قانونی: تأییدنشده/);
    assert.deepEqual(snapshot.resourceRequests, []);
    assert.deepEqual(remoteRequests, [], 'preview attempted a remote network request');
    assert.deepEqual(unexpectedPaths, [], 'preview attempted an API, asset, or unexpected same-origin request');
    assert.deepEqual(apiPaths, [], 'preview attempted an API request');

    assert.ok(previewResponse, 'HTTP response for /dadyar-preview/ was not observed');
    assert.equal(previewResponse.status, 200);
    const responseHeader = name => {
      const entry = Object.entries(previewResponse.headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
      return entry ? String(entry[1]) : '';
    };
    assert.match(responseHeader('content-type'), /^text\/html(?:;|$)/i);
    assert.match(responseHeader('content-security-policy'), /connect-src 'none'/);
    assert.match(responseHeader('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(responseHeader('x-frame-options').toLowerCase(), 'deny');
    assert.equal(responseHeader('cache-control').toLowerCase(), 'no-store');
    assert.equal(responseHeader('x-content-type-options').toLowerCase(), 'nosniff');
    assert.equal(responseHeader('referrer-policy').toLowerCase(), 'no-referrer');

    const downloadedPath = path.join(downloads, 'dadyar-synthetic-cheque.txt');
    const downloadDeadline = Date.now() + 8000;
    while (Date.now() < downloadDeadline &&
      (!fs.existsSync(downloadedPath) || fs.existsSync(downloadedPath + '.crdownload'))) {
      await delay(50);
    }
    assert.ok(fs.existsSync(downloadedPath), 'approved synthetic report was not downloaded');
    const downloadedReport = fs.readFileSync(downloadedPath, 'utf8');
    assert.match(downloadedReport, /نام بازبین: بازبین آزمون/);
    assert.match(downloadedReport, /نتیجه بازبینی: تأیید برای دریافت آموزشی/);
    assert.match(downloadedReport, /یادداشت بازبین: بازبینی داده ساختگی/);
    assert.match(downloadedReport, /پرسش آزاد با دامنه چک فرضی هم‌راستاست/);
    assert.doesNotMatch(downloadedReport, /پرسش آزاد چندموضوعی تشخیص داده شد/);
    assert.doesNotMatch(downloadedReport, /چک و مهریه در این مثال چه موضوعاتی هستند/);
    assert.match(downloadedReport, /هویت احراز نشده/);
    assert.match(downloadedReport, /منابع قانونی: تأییدنشده/);
  } finally {
    try { client?.socket.close(); } catch {}
    if (child.exitCode === null && child.signalCode === null) {
      signalChromiumTree(child, 'SIGTERM');
      await waitForChildExit(child, 1500);
    }
    if (process.platform !== 'win32' && child.pid) signalChromiumTree(child, 'SIGKILL');
    else if (child.exitCode === null && child.signalCode === null) signalChromiumTree(child, 'SIGKILL');
    await waitForChildExit(child, 1000);
    await delay(100);
    previewServer.closeAllConnections?.();
    await new Promise(resolve => previewServer.close(resolve));
    fs.rmSync(downloads, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
