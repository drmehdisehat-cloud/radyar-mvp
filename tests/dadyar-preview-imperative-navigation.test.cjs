'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static guard complements Chromium's runtime probe: it checks APIs that
// can navigate or submit data without using fetch, XHR or a declared link.
const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');
const forbidden = [
  {name:'window.open', re:/\b(?:window\s*\.\s*)?open\s*\(/i},
  {name:'location assignment', re:/\b(?:window\s*\.\s*|document\s*\.\s*)?location\s*(?:\.\s*href)?\s*=(?!=)/i},
  {name:'location navigation', re:/\b(?:window\s*\.\s*|document\s*\.\s*)?location\s*\.\s*(?:assign|replace)\s*\(/i},
  {name:'form submission', re:/\.\s*(?:submit|requestSubmit)\s*\(/i},
  {name:'image beacon', re:/\bnew\s+Image\s*\(/i},
  {name:'dynamic iframe', re:/\bcreateElement\s*\(\s*['"]iframe['"]\s*\)/i}
];

test('offline cheque preview has no imperative navigation or beacon sinks', () => {
  for (const {name,re} of forbidden) assert.doesNotMatch(html,re,name);
});

test('imperative navigation rules reject synthetic examples', () => {
  const examples = [
    'window.open("https://example.invalid")',
    'location.href = "https://example.invalid"',
    'window.location.replace("/api/collect")',
    'form.requestSubmit()',
    'new Image().src = "/api/collect"',
    'document.createElement("iframe")'
  ];
  examples.forEach((fixture,index) => assert.match(fixture,forbidden[index].re));
});
