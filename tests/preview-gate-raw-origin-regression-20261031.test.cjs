'use strict';
// Synthetic requests only; no listener, secrets or client data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalPreviewRequest } = require('../backend/preview-gate');
function req(rawHeaders, headers = {host:'localhost:4321', origin:'http://localhost:4321', 'sec-fetch-site':'same-origin'}) {
  return {socket:{remoteAddress:'127.0.0.1',localPort:4321}, headers, rawHeaders};
}
test('rejects duplicate raw Origin and Sec-Fetch-Site values', () => {
  for (const name of ['Origin','Sec-Fetch-Site']) {
    const value = name === 'Origin' ? 'http://localhost:4321' : 'same-origin';
    assert.equal(isLocalPreviewRequest(req(['Host','localhost:4321',name,value,name,value])),false,name);
  }
});
test('rejects disagreement between raw and normalized origin metadata', () => {
  assert.equal(isLocalPreviewRequest(req(['Host','localhost:4321','Origin','http://evil.example'])),false);
  assert.equal(isLocalPreviewRequest(req(['Host','localhost:4321','Sec-Fetch-Site','cross-site'])),false);
});
test('accepts consistent raw origin metadata', () => {
  assert.equal(isLocalPreviewRequest(req(['Host','localhost:4321','Origin','http://localhost:4321','Sec-Fetch-Site','same-origin'])),true);
});
