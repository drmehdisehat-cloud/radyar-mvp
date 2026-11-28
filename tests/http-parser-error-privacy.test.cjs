'use strict';
// Live loopback-only parser regression; sends no case data or secrets.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createServer } = require('../backend/server');

function sendRaw(port, raw) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let response = '';
    const timeout = setTimeout(() => socket.destroy(new Error('parser response timeout')), 3000);
    socket.on('connect', () => socket.write(raw));
    socket.on('data', bytes => { response += bytes.toString('utf8'); });
    socket.on('error', error => { clearTimeout(timeout); reject(error); });
    socket.on('close', () => { clearTimeout(timeout); resolve(response); });
  });
}

test('malformed HTTP and oversized headers receive a privacy-preserving 400', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    for (const raw of [
      'GET /health HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nBad Header: x\r\n\r\n',
      'GET /health HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nX-Noise: ' + 'a'.repeat(9000) + '\r\n\r\n',
    ]) {
      const response = await sendRaw(port, raw);
      assert.match(response, /^HTTP\/1\.1 400 Bad Request\r\n/);
      assert.match(response, /\r\nCache-Control: no-store\r\n/i);
      assert.match(response, /\r\nX-Content-Type-Options: nosniff\r\n/i);
      assert.match(response, /\r\nReferrer-Policy: no-referrer\r\n/i);
      assert.match(response, /\r\nConnection: close\r\n/i);
      assert.ok(response.endsWith('{"error":"bad_request"}'));
      assert.doesNotMatch(response, /HPE_|stack|X-Noise:|Bad Header:/);
    }
    const healthy = await fetch('http://127.0.0.1:' + port + '/health', {
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(healthy.status, 200, 'ordinary loopback requests remain available');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
