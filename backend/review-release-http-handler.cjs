'use strict';

const http = require('node:http');
const { parseJsonRejectDuplicateKeys } = require('../scripts/strict-json.cjs');

const DEFAULT_ROUTE_PATH = '/api/dadyar/review-report';
const DEFAULT_MAX_BODY_BYTES = 8192;
const DEFAULT_MAX_REPORT_BYTES = 262144;
const DEFAULT_BODY_TIMEOUT_MS = 10000;

function isCanonicalOriginFormPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      value.includes('\\') || value.includes('%') || value.includes('?') ||
      value.includes('#') || value.includes('//')) return false;
  if (value.split('/').some(segment => segment === '.' || segment === '..')) return false;
  try {
    const parsed = new URL(value, 'https://dadyar.invalid');
    return parsed.origin === 'https://dadyar.invalid' &&
      parsed.pathname === value && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function canonicalHttpsOrigin(value) {
  if (typeof value !== 'string' || !value) throw new TypeError('An exact HTTPS allowedOrigin is required.');
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new TypeError('allowedOrigin must be a valid HTTPS origin.'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== value ||
      parsed.pathname !== '/' || parsed.search || parsed.hash ||
      parsed.username || parsed.password) {
    throw new TypeError('allowedOrigin must be a canonical HTTPS origin without a path.');
  }
  return parsed.origin;
}

function hasAmbiguousSecurityHeaders(request) {
  const rawHeaders = request && request.rawHeaders;
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) return true;
  const singleton = new Set([
    'host', 'origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
    'content-type', 'content-encoding', 'content-length', 'transfer-encoding',
    'expect', 'cookie', 'authorization', 'proxy-authorization',
    'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
    'x-original-host', 'x-authenticated-user', 'remote-user', 'x-test-session'
  ]);
  const seen = new Set();
  let hasContentLength = false;
  let hasTransferEncoding = false;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (typeof name !== 'string' || typeof value !== 'string') return true;
    const lower = name.toLowerCase();
    if (singleton.has(lower)) {
      if (seen.has(lower)) return true;
      seen.add(lower);
    }
    if (lower === 'content-length') hasContentLength = true;
    if (lower === 'transfer-encoding') hasTransferEncoding = true;
  }
  return hasContentLength && hasTransferEncoding;
}

function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store, private, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
}

function respond(response, status, message, extraHeaders = {}) {
  if (response.destroyed || response.headersSent || response.writableEnded) return;
  setSecurityHeaders(response);
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.statusCode = status;
  response.end(message);
}

function isJsonUtf8(contentType) {
  if (typeof contentType !== 'string') return false;
  const parts = contentType.split(';').map(part => part.trim().toLowerCase());
  if (parts.shift() !== 'application/json') return false;
  return parts.every(part => part === 'charset=utf-8') && parts.length <= 1;
}

function readLimitedBody(request, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('aborted', onAborted);
      request.removeListener('close', onClose);
      request.removeListener('error', onError);
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const fail = (code, message) => {
      const error = new Error(message);
      error.code = code;
      request.pause();
      finish(error);
    };
    const onData = chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) return fail('BODY_TOO_LARGE', 'Request body exceeds configured limit.');
      chunks.push(Buffer.from(chunk));
    };
    const onEnd = () => finish(null, Buffer.concat(chunks));
    const onAborted = () => fail('REQUEST_ABORTED', 'Request body was aborted.');
    const onClose = () => {
      if (!request.complete) fail('REQUEST_ABORTED', 'Request closed before the body completed.');
    };
    const onError = error => { if (!settled) finish(error); };
    const timer = setTimeout(() => fail('BODY_TIMEOUT', 'Request body exceeded the configured time limit.'), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('aborted', onAborted);
    request.once('close', onClose);
    request.on('error', onError);
  });
}

function respondAndCloseRequest(request, response, status, message) {
  request.pause();
  respond(response, status, message, { Connection: 'close' });
  response.once('finish', () => {
    if (!request.complete && !request.destroyed) request.destroy();
  });
}

function gateFailureStatus(error) {
  const message = error && typeof error.message === 'string' ? error.message : '';
  if (/authenticated reviewer principal/i.test(message)) return 401;
  if (/independent|review|signature|nonce|trusted|approved|expired|future|revoked|does not match|not bound/i.test(message)) return 403;
  return 503;
}

/**
 * HTTP boundary only. A real identity provider, reviewer-independence policy,
 * pinned trust registry, durable nonce store and server-side report loader must
 * be injected. This module intentionally supplies none of those dependencies
 * and is not wired into backend/server.js.
 */
function createReviewReleaseHttpHandler(options = {}) {
  const {
    releaseReviewedReport,
    allowedOrigin,
    routePath = DEFAULT_ROUTE_PATH,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
    maxReportBytes = DEFAULT_MAX_REPORT_BYTES,
    bodyTimeoutMs = DEFAULT_BODY_TIMEOUT_MS
  } = options;
  if (typeof releaseReviewedReport !== 'function') throw new TypeError('A server-side releaseReviewedReport function is required.');
  const origin = canonicalHttpsOrigin(allowedOrigin);
  if (!isCanonicalOriginFormPath(routePath)) throw new TypeError('routePath must be a canonical absolute path without query, fragment, encoding or normalization aliases.');
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 65536) throw new TypeError('maxBodyBytes must be an integer between 1024 and 65536.');
  if (!Number.isSafeInteger(maxReportBytes) || maxReportBytes < 1 || maxReportBytes > 1048576) throw new TypeError('maxReportBytes must be an integer between 1 and 1048576.');
  if (!Number.isSafeInteger(bodyTimeoutMs) || bodyTimeoutMs < 50 || bodyTimeoutMs > 30000) throw new TypeError('bodyTimeoutMs must be an integer between 50 and 30000.');

  return async function dadyarReviewReportHandler(request, response) {
    if (hasAmbiguousSecurityHeaders(request)) return respondAndCloseRequest(request, response, 400, 'سرآیندهای تکراری یا مبهم درخواست پذیرفته نیستند.');
    if (request.headers && Object.prototype.hasOwnProperty.call(request.headers, 'expect')) {
      return respondAndCloseRequest(request, response, 417, 'درخواست دارای Expect پشتیبانی نمی‌شود.');
    }
    if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//')) {
      return respond(response, 400, 'هدف درخواست نامعتبر است.');
    }
    if (request.url !== routePath) return respond(response, 404, 'مسیر پیدا نشد.');
    if (request.method !== 'POST') return respond(response, 405, 'فقط درخواست POST مجاز است.', { Allow: 'POST' });
    if (request.headers.origin !== origin) return respond(response, 403, 'مبدأ درخواست مجاز نیست.');
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite && String(fetchSite).toLowerCase() !== 'same-origin') return respond(response, 403, 'درخواست بین‌مبدأیی مجاز نیست.');
    if (!isJsonUtf8(request.headers['content-type'])) return respond(response, 415, 'نوع محتوای درخواست باید application/json با UTF-8 باشد.');
    const contentEncoding = request.headers['content-encoding'];
    if (contentEncoding && String(contentEncoding).toLowerCase() !== 'identity') return respond(response, 415, 'فشرده‌سازی بدنه درخواست پشتیبانی نمی‌شود.');
    const contentLength = request.headers['content-length'];
    if (contentLength !== undefined) {
      if (!/^\d+$/.test(String(contentLength))) return respond(response, 400, 'طول بدنه درخواست نامعتبر است.');
      if (Number(contentLength) > maxBodyBytes) return respond(response, 413, 'حجم درخواست بیش از حد مجاز است.');
    }

    let bodyBytes;
    try {
      bodyBytes = await readLimitedBody(request, maxBodyBytes, bodyTimeoutMs);
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') return respondAndCloseRequest(request, response, 413, 'حجم درخواست بیش از حد مجاز است.');
      if (error && error.code === 'BODY_TIMEOUT') return respondAndCloseRequest(request, response, 408, 'مهلت دریافت بدنه درخواست پایان یافت.');
      if (error && error.code === 'REQUEST_ABORTED') {
        if (!request.destroyed && !response.destroyed) return respondAndCloseRequest(request, response, 400, 'دریافت بدنه درخواست کامل نشد.');
        return;
      }
      return respondAndCloseRequest(request, response, 400, 'خواندن بدنه درخواست ناموفق بود.');
    }

    let body;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      body = parseJsonRejectDuplicateKeys(decoder.decode(bodyBytes));
    } catch {
      return respond(response, 400, 'ساختار JSON درخواست نامعتبر است.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'envelope') ||
        !body.envelope || typeof body.envelope !== 'object' || Array.isArray(body.envelope)) {
      return respond(response, 400, 'بدنه درخواست باید فقط شامل پاکت امضای بازبینی باشد.');
    }

    let released;
    try {
      released = await releaseReviewedReport({ request, envelope: body.envelope });
    } catch (error) {
      const status = gateFailureStatus(error);
      if (status === 401) return respond(response, 401, 'نشست بازبین معتبر نیست.');
      if (status === 403) return respond(response, 403, 'بازبینی معتبر یا مجوز دریافت گزارش احراز نشد.');
      return respond(response, 503, 'در حال حاضر امکان تحویل گزارش وجود ندارد.');
    }
    const reportBytes = released && released.reportBytes;
    if ((!Buffer.isBuffer(reportBytes) && !(reportBytes instanceof Uint8Array)) ||
        reportBytes.byteLength < 1 || reportBytes.byteLength > maxReportBytes) {
      return respond(response, 503, 'گزارش در مخزن امن قابل تحویل نیست.');
    }
    setSecurityHeaders(response);
    response.setHeader('Content-Disposition', 'attachment; filename="dadyar-reviewed-report.txt"');
    response.setHeader('Content-Length', String(reportBytes.byteLength));
    response.statusCode = 200;
    response.end(Buffer.from(reportBytes));
  };
}

function createReviewReleaseHttpServer(handler) {
  if (typeof handler !== 'function') throw new TypeError('A review HTTP request handler is required.');
  const server = http.createServer({ maxHeaderSize: 8192 }, handler);
  server.requestTimeout = 15000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 64;
  const rejectExpectation = (request, response) => respondAndCloseRequest(request, response, 417, 'درخواست دارای Expect پشتیبانی نمی‌شود.');
  server.on('checkContinue', rejectExpectation);
  server.on('checkExpectation', rejectExpectation);
  return server;
}

module.exports = {
  DEFAULT_ROUTE_PATH,
  createReviewReleaseHttpHandler,
  createReviewReleaseHttpServer,
  canonicalHttpsOrigin,
  isCanonicalOriginFormPath
};
