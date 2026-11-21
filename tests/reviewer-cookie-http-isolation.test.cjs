'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '../backend');
const serializerPath = path.join(backendRoot, 'reviewer-session-cookie.cjs');

function listBackendSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listBackendSources(absolute);
    return (entry.name.endsWith('.cjs') || entry.name.endsWith('.js')) && absolute !== serializerPath ? [absolute] : [];
  });
}

test('reviewer cookie serializer stays disconnected from every backend entry point until trusted IdP integration is reviewed', () => {
  const sources = listBackendSources(backendRoot);
  assert.ok(sources.length > 0, 'backend source inventory must not be empty');

  const references = [];
  for (const filename of sources) {
    const source = fs.readFileSync(filename, 'utf8');
    if (/reviewer-session-cookie|createReviewerSessionCookie|clearReviewerSessionCookie/.test(source)) {
      references.push(path.relative(path.join(__dirname, '..'), filename));
    }
  }

  assert.deepEqual(
    references,
    [],
    'cookie serialization must not be wired into HTTP/authentication code before a trusted IdP, session-revocation store, and independent security review exist'
  );
});

test('the cookie helper exposes serialization only, not an authentication or authorization API', () => {
  const helper = require('../backend/reviewer-session-cookie.cjs');
  assert.equal(typeof helper.createReviewerSessionCookie, 'function');
  assert.equal(typeof helper.clearReviewerSessionCookie, 'function');
  for (const name of ['authenticateReviewer', 'verifyReviewerJwt', 'authorizeReviewer', 'issueReviewerIdentity']) {
    assert.equal(helper[name], undefined, name + ' must not be implied by a cookie serializer');
  }
});
