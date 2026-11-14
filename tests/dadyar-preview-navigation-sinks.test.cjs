'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
// These HTML features can initiate outbound navigation or requests without fetch/XHR.
const forbidden = [
  {name:'meta refresh', re:/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i},
  {name:'ping attribute', re:/\bping\s*=\s*["'][^"']+["']/i},
  {name:'formaction attribute', re:/\bformaction\s*=/i},
  {name:'srcset attribute', re:/\bsrcset\s*=/i},
  {name:'remote anchor', re:/<a\b[^>]*href\s*=\s*["']?\s*(?:https?:|\/\/)/i},
  {name:'remote form action', re:/<form\b[^>]*action\s*=\s*["']?\s*(?:https?:|\/\/)/i}
];

test('deployable cheque preview has no declarative navigation or beacon escape hatches', () => {
  for (const {name,re} of forbidden) assert.doesNotMatch(html,re,name);
});

test('navigation sink rules reject synthetic outbound fixtures', () => {
  const examples = [
    '<meta http-equiv="refresh" content="0;url=https://example.invalid">',
    '<a ping="https://example.invalid/p" href="#">open</a>',
    '<button formaction="/api/submit">send</button>',
    '<img srcset="https://example.invalid/p 2x">',
    '<a href="https://example.invalid">external</a>',
    '<form action="//example.invalid/collect"></form>'
  ];
  examples.forEach((fixture,index) => assert.match(fixture,forbidden[index].re));
});
