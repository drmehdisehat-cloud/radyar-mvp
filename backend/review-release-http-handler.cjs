'use strict';

const DEFAULT_ROUTE_PATH = '/api/dadyar/review-report';
const DEFAULT_MAX_BODY_BYTES = 8192;
const DEFAULT_MAX_REPORT_BYTES = 262144;

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
  if (response.headersSent || response.writableEnded) return;
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

async function readLimitedBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      oversized = true;
      chunks.length = 0;
    } else if (!oversized) {
      chunks.push(Buffer.from(chunk));
    }
  }
  if (oversized) {
    const error = new Error('Request body exceeds configured limit.');
    error.code = 'BODY_TOO_LARGE';
    throw error;
  }
  return Buffer.concat(chunks);
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
    maxReportBytes = DEFAULT_MAX_REPORT_BYTES
  } = options;

  if (typeof releaseReviewedReport !== 'function') {
    throw new TypeError('A server-side releaseReviewedReport function is required.');
  }
  const origin = canonicalHttpsOrigin(allowedOrigin);
  if (typeof routePath !== 'string' || !routePath.startsWith('/') ||
      routePath.includes('?') || routePath.includes('#')) {
    throw new TypeError('routePath must be an absolute path without a query or fragment.');
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 65536) {
    throw new TypeError('maxBodyBytes must be an integer between 1024 and 65536.');
  }
  if (!Number.isSafeInteger(maxReportBytes) || maxReportBytes < 1 || maxReportBytes > 1048576) {
    throw new TypeError('maxReportBytes must be an integer between 1 and 1048576.');
  }

  return async function dadyarReviewReportHandler(request, response) {
    if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//')) {
      respond(response, 400, 'هدف درخواست نامعتبر است.');
      return;
    }
    let requestUrl;
    try {
      requestUrl = new URL(request.url || '/', 'https://dadyar.invalid');
    } catch {
      respond(response, 400, 'درخواست نامعتبر است.');
      return;
    }

    if (requestUrl.pathname !== routePath || requestUrl.search || requestUrl.hash) {
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
      bodyBytes = await readLimitedBody(request, maxBodyBytes);
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        respond(response, 413, 'حجم درخواست بیش از حد مجاز است.');
      } else {
        respond(response, 400, 'خواندن بدنه درخواست ناموفق بود.');
      }
      return;
    }

    let body;
    try {
      body = JSON.parse(bodyBytes.toString('utf8'));
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

module.exports = {
  DEFAULT_ROUTE_PATH,
  createReviewReleaseHttpHandler
};
