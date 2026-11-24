'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../backend/server');

test('reviewed-report HTTP adapter remains unreachable from the development server', async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const server = createServer();

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address.port === 'number');
    const origin = 'http://127.0.0.1:' + address.port;

    const response = await fetch(origin + '/api/dadyar/review-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        envelope: {
          decision: 'approved',
          synthetic: true
        }
      })
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('the offline preview does not contain the server report endpoint', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
  assert.doesNotMatch(html, /\/api\/dadyar\/review-report/);
});
