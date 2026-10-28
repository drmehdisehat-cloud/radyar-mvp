'use strict';
// Live loopback-only regression using synthetic payloads; no client records.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createServer } = require('../backend/server');

const sample = {
  topic: 'check',
  role: 'شاهد',
  story: 'شرح ساختگی برای بررسی هدرهای تکراری درخواست محلی',
  answers: ['پاسخ اول', 'پاسخ دوم', 'پاسخ سوم', 'پاسخ چهارم', 'پاسخ پنجم']
};

function postRaw(port, extraHeaders) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(sample);
    const socket = net.connect({ host: '127.0.0.1', port });
    let response = '';
    socket.setTimeout(4000, () => socket.destroy(new Error('raw HTTP timeout')));
    socket.on('connect', () => {
      socket.end('POST /api/cases/validate HTTP/1.1\r\n' +
        'Host: 127.0.0.1:' + port + '\r\n' +
        extraHeaders.map(line => line + '\r\n').join('') +
        'Content-Length: ' + Buffer.byteLength(body) + '\r\n' +
        'Connection: close\r\n\r\n' + body);
    });
    socket.on('data', chunk => { response += chunk.toString('utf8'); });
    socket.on('error', reject);
    socket.on('end', () => {
      const status = /^HTTP\/1\.1 (\d{3})/.exec(response);
      if (!status) return reject(new Error('missing HTTP status line'));
      resolve({ status: Number(status[1]), response });
    });
  });
}

test('duplicate security-sensitive headers cannot bypass local JSON boundary', async () => {
  const server = createServer({ rateLimit: { max: 100, windowMs: 60000 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const origin = 'Origin: http://127.0.0.1:' + port;
    const valid = await postRaw(port, [
      'Content-Type: application/json', origin, 'Sec-Fetch-Site: same-origin'
    ]);
    assert.equal(valid.status, 200, valid.response);
    for (const headers of [
      ['Content-Type: application/json', 'content-type: text/plain'],
      ['Content-Type: application/json', origin, 'oRiGiN: https://attacker.invalid'],
      ['Content-Type: application/json', 'Sec-Fetch-Site: same-origin',
        'sec-fetch-site: cross-site'],
      ['Content-Type: application/json', 'Content-Encoding: identity',
        'content-encoding: gzip']
    ]) {
      const result = await postRaw(port, headers);
      assert.equal(result.status, 400, headers.join(' | ') + ': ' + result.response);
      assert.match(result.response, /"error":"ambiguous_request_headers"/);
      assert.doesNotMatch(result.response, /پاسخ اول|شرح ساختگی/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
