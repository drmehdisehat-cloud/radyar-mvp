'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const head = html.match(/<head>([\\s\\S]*?)<\\/head>/i)?.[1] || '';

test('experimental Dadyar preview is not indexed and does not leak referrers', () => {
  assert.match(head, /<meta\\s+name="robots"\\s+content="noindex,nofollow,noarchive"\\s*\\/?>/i,
    'preview must explicitly opt out of indexing, following and archiving');
  assert.match(head, /<meta\\s+name="referrer"\\s+content="no-referrer"\\s*\\/?>/i,
    'preview must suppress referrer disclosure');
  assert.match(head, /http-equiv="Content-Security-Policy"/i,
    'preview CSP must remain in the document head');
  assert.match(head, /connect-src 'none'/,
    'preview must remain disconnected from network APIs');
});
