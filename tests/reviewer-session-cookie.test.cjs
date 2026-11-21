'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COOKIE_NAME,
  MAX_COOKIE_AGE_SECONDS,
  isCanonicalCompactToken,
  createReviewerSessionCookie,
  clearReviewerSessionCookie
} = require('../backend/reviewer-session-cookie.cjs');

function syntheticToken() {
  const encode = value => Buffer.from(value).toString('base64url');
  return [
    encode(JSON.stringify({ alg: 'RS256', kid: 'synthetic-key' })),
    encode(JSON.stringify({ sub: 'synthetic-reviewer' })),
    Buffer.alloc(256, 0x5a).toString('base64url')
  ].join('.');
}

test('reviewer cookie uses the exact __Host- security attributes and no Domain', () => {
  const token = syntheticToken();
  const cookie = createReviewerSessionCookie(token);
  assert.equal(cookie,
    COOKIE_NAME + '=' + token +
    '; Path=/; Max-Age=300; Secure; HttpOnly; SameSite=Strict');
  assert.match(cookie, /^__Host-[^=]+=.+; Path=\/$/);
  assert.match(cookie, /; Secure(?:;|$)/);
  assert.match(cookie, /; HttpOnly(?:;|$)/);
  assert.match(cookie, /; SameSite=Strict(?:;|$)/);
  assert.doesNotMatch(cookie, /(?:^|; )Domain=/i);
});

test('reviewer cookie lifetime is bounded to the short-lived session policy', () => {
  const token = syntheticToken();
  assert.equal(MAX_COOKIE_AGE_SECONDS, 300);
  assert.match(createReviewerSessionCookie(token, { maxAgeSeconds: 1 }), /Max-Age=1/);
  assert.match(createReviewerSessionCookie(token, { maxAgeSeconds: 300 }), /Max-Age=300/);
  for (const value of [0, -1, 301, 1.5, NaN, Infinity, '300']) {
    assert.throws(() => createReviewerSessionCookie(token, { maxAgeSeconds: value }), /integer from 1 through 300/);
  }
  assert.throws(() => createReviewerSessionCookie(token, { maxAgeSeconds: 30, domain: 'example.test' }),
    /Only maxAgeSeconds may be configured/);
});

test('logout cookie clears the same __Host- cookie with matching security attributes', () => {
  assert.equal(clearReviewerSessionCookie(),
    COOKIE_NAME + '=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict');
  assert.doesNotMatch(clearReviewerSessionCookie(), /(?:^|; )Domain=/i);
});

test('cookie serializer accepts only bounded canonical three-segment base64url tokens', () => {
  const valid = syntheticToken();
  assert.equal(isCanonicalCompactToken(valid), true);
  assert.equal(isCanonicalCompactToken(''), false);
  assert.equal(isCanonicalCompactToken('one.two'), false);
  assert.equal(isCanonicalCompactToken('.two.three'), false);
  assert.equal(isCanonicalCompactToken('one.two.'), false);
  assert.equal(isCanonicalCompactToken('one=.two.three'), false);
  assert.equal(isCanonicalCompactToken('one.two.three='), false);
  assert.equal(isCanonicalCompactToken('one.two.three!'), false);
  assert.equal(isCanonicalCompactToken('x'.repeat(8193)), false);
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(isCanonicalCompactToken(value), false);
    assert.throws(() => createReviewerSessionCookie(value), /canonical compact token/);
  }
  assert.throws(() => createReviewerSessionCookie('one.two'), /canonical compact token/);
});
