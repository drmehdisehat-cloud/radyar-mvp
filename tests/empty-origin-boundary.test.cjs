'use strict';
// Synthetic-only live HTTP regression: an empty Origin must not bypass the
// same-origin check on the unauthenticated loopback development endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createServer } = require('../backend/server');

const sample = {
  topic: 'fraud',
  role: 'شاهد',
  story: 'شرح کاملاً ساختگی برای آزمون مرز مبدأ درخواست محلی',
  answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم'],
};

function postRaw(port, originHeader) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(sample);
    const socket = net.connect({ host: '127.0.0.1', port });
    let response = '';
    socket.setTimeout(4000, () => socket.destroy(new Error('raw HTTP timeout')));
    socket.on('connect', () => socket.end(
      'POST /api/cases/validate HTTP/1.1\r\n' +
      'Host: 127.0.0.1:' + port + '\r\n' +
      (originHeader === null ? '' : originHeader + '\r\n') +
      'Content-Type: application/json\r\n' +
      'Content-Length: ' + Buffer.byteLength(body) + '\r\n' +
      'Connection: close\r\n\r\n' + body
    ));
    socket.on('data', chunk => { response += chunk.toString('utf8'); });
    socket.on('error', reject);
    socket.on('end', () => {
      const match = /^HTTP\/1\.1 (\d{3})/.exec(response);
      if (!match) return reject(new Error('missing HTTP response status'));
      resolve({ status: Number(match[1]), response });
    });
  });
}

test('local API rejects explicitly empty or invalid Origin, accepts absent or exact Origin', async () => {
  const server = createServer({ rateLimit: { max: 50, windowMs: 60_000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    for (const origin of [null, 'Origin: http://127.0.0.1:' + port]) {
      const result = await postRaw(port, origin);
      assert.equal(result.status, 200, String(origin) + ': ' + result.response);
    }
    for (const origin of ['Origin:', 'Origin:   ', 'Origin: null',
                          'Origin: https://attacker.invalid']) {
      const result = await postRaw(port, origin);
      assert.equal(result.status, 403, origin + ': ' + result.response);
      assert.match(result.response, /"error":"local_origin_required"/);
      assert.match(result.response, /Cache-Control: no-store/i);
      assert.doesNotMatch(result.response, /شرح کاملاً ساختگی|پاسخ اول/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
