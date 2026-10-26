'use strict';
// Live loopback HTTP regression with synthetic requests only.
// Node's req.headers.host normally keeps the first Host value, so inspect
// rawHeaders to reject an ambiguous second Host field.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createServer } = require('../backend/server');

function rawGet(port, hostLines) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let response = '';
    socket.setTimeout(4000, () => socket.destroy(new Error('raw HTTP timeout')));
    socket.on('connect', () => {
      socket.end('GET /health HTTP/1.1\r\n' +
        hostLines.map(line => line + '\r\n').join('') +
        'Connection: close\r\n\r\n');
    });
    socket.on('data', bytes => { response += bytes.toString('utf8'); });
    socket.on('error', reject);
    socket.on('end', () => {
      const status = /^HTTP\/1\.1 (\d{3})/.exec(response);
      if (!status) return reject(new Error('missing HTTP status line'));
      resolve({ status: Number(status[1]), response });
    });
  });
}

test('development API rejects duplicate Host headers, including mixed-case fields', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const local = 'Host: 127.0.0.1:' + port;
    const valid = await rawGet(port, [local]);
    assert.equal(valid.status, 200, 'ordinary local request still works');
    for (const headers of [
      [local, 'Host: attacker.invalid'],
      [local, 'hOsT: localhost:' + port],
      ['Host: attacker.invalid', local],
    ]) {
      const result = await rawGet(port, headers);
      assert.equal(result.status, 403, headers.join(' | '));
      assert.match(result.response, /"error":"local_origin_required"/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
