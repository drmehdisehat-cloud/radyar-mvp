'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../backend/server');

test('private chat companion assets load from local server; unlisted files remain denied', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const [route, type, marker] of [
      ['/companion.js', 'text/javascript', 'data-dadyar-companion'],
      ['/companion.css', 'text/css', '.dadyar-companion'],
    ]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), new RegExp(type));
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(await response.text(), new RegExp(marker.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')));
    }
    const forbidden = await fetch(origin + '/backend/ai-handler.js');
    assert.equal(forbidden.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
