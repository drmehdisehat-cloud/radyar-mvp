'use strict';
// Synthetic-only regression for the disconnected preview gate. No real secrets
// or case data; passing does not authorize network deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createPreviewTestServer } = require('../backend/preview-http');
const { isLocalPreviewRequest } = require('../backend/preview-gate');

const token = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url');

function request(port, host, extras = []) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method: 'GET',
      path: '/preview', headers: ['Host', host, 'Authorization', 'Bearer ' + token, ...extras]
    }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode,
        cache: res.headers['cache-control'], length: res.headers['content-length'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('real preview gate rejects nonlocal Host, forwarded traffic and cross-origin requests', async () => {
  let downstream = 0;
  const server = createPreviewTestServer(token, (_req, res) => {
    downstream++;
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    for (const [host, extras] of [
      ['evil.example:' + port, []],
      ['127.0.0.1:' + (port === 65535 ? 1 : port + 1), []],
      ['127.0.0.1:' + port, ['Origin', 'http://evil.example']],
      ['127.0.0.1:' + port, ['Sec-Fetch-Site', 'cross-site']],
      ['127.0.0.1:' + port, ['X-Forwarded-For', '203.0.113.10']],
      ['127.0.0.1:' + port, ['Forwarded', 'for=203.0.113.10']],
      ['127.0.0.1:' + port, ['Via', '1.1 proxy']],
    ]) {
      const result = await request(port, host, extras);
      assert.equal(result.status, 401, 'must reject a forged origin or proxy marker');
      assert.equal(result.cache, 'no-store');
      assert.equal(result.length, '0');
      assert.equal(downstream, 0);
    }
    const accepted = await request(port, '127.0.0.1:' + port,
      ['Origin', 'http://127.0.0.1:' + port, 'Sec-Fetch-Site', 'same-origin']);
    assert.equal(accepted.status, 204);
    assert.equal(downstream, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('preview origin check fails closed for non-loopback peers and duplicate Host', () => {
  const headers = { host: '127.0.0.1:8787' };
  const base = { headers, socket: { remoteAddress: '127.0.0.1', localPort: 8787 },
    rawHeaders: ['Host', '127.0.0.1:8787'] };
  assert.equal(isLocalPreviewRequest(base), true);
  assert.equal(isLocalPreviewRequest({ ...base,
    socket: { remoteAddress: '203.0.113.10', localPort: 8787 } }), false);
  assert.equal(isLocalPreviewRequest({ ...base,
    rawHeaders: [...base.rawHeaders, 'HOST', '127.0.0.1:8787'] }), false);
  assert.equal(isLocalPreviewRequest({ ...base, rawHeaders: undefined }), false);
});
