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
  if (typeof value !== 'string' || !value) {
    throw new TypeError('An exact HTTPS allowedOrigin is required.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('allowedOrigin must be a valid HTTPS origin.');
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== value ||
      parsed.pathname !== '/' || parsed.search || parsed.hash ||
      parsed.username || parsed.password) {
    throw new TypeError('allowedOrigin must be a canonical HTTPS origin without a path.');
  }
  return parsed.origin;
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
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value);
  }
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
      if (size > maxBytes) {
        fail('BODY_TOO_LARGE', 'Request body exceeds configured limit.');
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    const onEnd = () => finish(null, Buffer.concat(chunks));
    const onAborted = () => fail('REQUEST_ABORTED', 'Request body was aborted.');
    const onClose = () => {
      if (!request.complete) fail('REQUEST_ABORTED', 'Request closed before the body completed.');
    };
    const onError = error => {
      if (!settled) finish(error);
    };

    const timer = setTimeout(() => {
      fail('BODY_TIMEOUT', 'Request body exceeded the configured time limit.');
    }, timeoutMs);
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
  if (/independent|review|signature|nonce|trusted|approved|expired|future|revoked|does not match|not bound/i.test(message)) {
    return 403;
  }
  return 503;
}

/**
 * Creates a same-origin HTTP adapter for the signed-review report release gate.
 *
 * The caller must inject a release gate backed by a real server-side identity
 * provider, independence policy, immutable server storage, trusted key registry
 * and durable nonce store. This module deliberately provides none of them.
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

  if (typeof releaseReviewedReport !== 'function') {
    throw new TypeError('A server-side releaseReviewedReport function is required.');
  }
  const origin = canonicalHttpsOrigin(allowedOrigin);
  if (!isCanonicalOriginFormPath(routePath)) {
    throw new TypeError('routePath must be a canonical absolute path without query, fragment, encoding or normalization aliases.');
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 65536) {
    throw new TypeError('maxBodyBytes must be an integer between 1024 and 65536.');
  }
  if (!Number.isSafeInteger(maxReportBytes) || maxReportBytes < 1 || maxReportBytes > 1048576) {
    throw new TypeError('maxReportBytes must be an integer between 1 and 1048576.');
  }
  if (!Number.isSafeInteger(bodyTimeoutMs) || bodyTimeoutMs < 50 || bodyTimeoutMs > 30000) {
    throw new TypeError('bodyTimeoutMs must be an integer between 50 and 30000.');
  }

  return async function dadyarReviewReportHandler(request, response) {
    // Reject expectation headers before reading any request body. Use the server
    // factory below so Node does not emit an automatic 100 Continue first.
    if (request.headers && Object.prototype.hasOwnProperty.call(request.headers, 'expect')) {
      respondAndCloseRequest(request, response, 417, 'درخواست دارای Expect پشتیبانی نمی‌شود.');
      return;
    }
    if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//')) {
      respond(response, 400, 'هدف درخواست نامعتبر است.');
      return;
    }
    // Compare the raw origin-form request target before URL parsing. URL()
    // normalizes dot segments and backslashes, which can create aliases that
    // a reverse proxy and the Node origin interpret differently.
    if (request.url !== routePath) {
      respond(response, 404, 'مسیر پیدا نشد.');
      return;
    }
    if (request.method !== 'POST') {
      respond(response, 405, 'فقط درخواست POST مجاز است.', { Allow: 'POST' });
      return;
    }
    if (request.headers.origin !== origin) {
      respond(response, 403, 'مبدأ درخواست مجاز نیست.');
      return;
    }
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite && String(fetchSite).toLowerCase() !== 'same-origin') {
      respond(response, 403, 'درخواست بین‌مبدأیی مجاز نیست.');
      return;
    }
    if (!isJsonUtf8(request.headers['content-type'])) {
      respond(response, 415, 'نوع محتوای درخواست باید application/json با UTF-8 باشد.');
      return;
    }
    const contentEncoding = request.headers['content-encoding'];
    if (contentEncoding && String(contentEncoding).toLowerCase() !== 'identity') {
      respond(response, 415, 'فشرده‌سازی بدنه درخواست پشتیبانی نمی‌شود.');
      return;
    }
    const contentLength = request.headers['content-length'];
    if (contentLength !== undefined) {
      if (!/^\d+$/.test(String(contentLength))) {
        respond(response, 400, 'طول بدنه درخواست نامعتبر است.');
        return;
      }
      if (Number(contentLength) > maxBodyBytes) {
        respond(response, 413, 'حجم درخواست بیش از حد مجاز است.');
        return;
      }
    }

    let bodyBytes;
    try {
      bodyBytes = await readLimitedBody(request, maxBodyBytes, bodyTimeoutMs);
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        respondAndCloseRequest(request, response, 413, 'حجم درخواست بیش از حد مجاز است.');
      } else if (error && error.code === 'BODY_TIMEOUT') {
        respondAndCloseRequest(request, response, 408, 'مهلت دریافت بدنه درخواست پایان یافت.');
      } else if (error && error.code === 'REQUEST_ABORTED') {
        if (!request.destroyed && !response.destroyed) {
          respondAndCloseRequest(request, response, 400, 'دریافت بدنه درخواست کامل نشد.');
        }
      } else {
        respondAndCloseRequest(request, response, 400, 'خواندن بدنه درخواست ناموفق بود.');
      }
      return;
    }

    let body;
    try {
      // Buffer.toString('utf8') replaces malformed byte sequences. Reject
      // malformed UTF-8 before JSON parsing so the signed envelope has one
      // unambiguous byte-to-text representation.
      const decoder = new TextDecoder('utf-8', { fatal: true });
      body = parseJsonRejectDuplicateKeys(decoder.decode(bodyBytes));
    } catch {
      respond(response, 400, 'ساختار JSON درخواست نامعتبر است.');
      return;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'envelope') ||
        !body.envelope || typeof body.envelope !== 'object' || Array.isArray(body.envelope)) {
      respond(response, 400, 'بدنه درخواست باید فقط شامل پاکت امضای بازبینی باشد.');
      return;
    }

    let released;
    try {
      released = await releaseReviewedReport({ request, envelope: body.envelope });
    } catch (error) {
      const status = gateFailureStatus(error);
      if (status === 401) {
        respond(response, 401, 'نشست بازبین معتبر نیست.');
      } else if (status === 403) {
        respond(response, 403, 'بازبینی معتبر یا مجوز دریافت گزارش احراز نشد.');
      } else {
        respond(response, 503, 'در حال حاضر امکان تحویل گزارش وجود ندارد.');
      }
      return;
    }

    const reportBytes = released && released.reportBytes;
    if ((!Buffer.isBuffer(reportBytes) && !(reportBytes instanceof Uint8Array)) ||
        reportBytes.byteLength < 1 || reportBytes.byteLength > maxReportBytes) {
      respond(response, 503, 'گزارش در مخزن امن قابل تحویل نیست.');
      return;
    }

    setSecurityHeaders(response);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="dadyar-reviewed-report.txt"');
    response.setHeader('Content-Length', String(reportBytes.byteLength));
    response.statusCode = 200;
    response.end(Buffer.from(reportBytes));
  };
}

function createReviewReleaseHttpServer(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('A review HTTP request handler is required.');
  }
  const server = http.createServer(handler);
  const rejectExpectation = (request, response) => {
    respondAndCloseRequest(request, response, 417, 'درخواست دارای Expect پشتیبانی نمی‌شود.');
  };
  // When a checkContinue listener exists, Node does not emit the ordinary
  // request event or send an interim 100 response automatically.
  server.on('checkContinue', rejectExpectation);
  server.on('checkExpectation', rejectExpectation);
  return server;
}

module.exports = {
  DEFAULT_ROUTE_PATH,
  createReviewReleaseHttpHandler,
  createReviewReleaseHttpServer
};
