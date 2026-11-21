'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COOKIE_NAME,
  MAX_TOKEN_LENGTH,
  MAX_COOKIE_BYTES,
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
  assert.ok(cookie.includes('; Path=/; Max-Age=300;'));
  assert.match(cookie, /^__Host-[^=]+=.+;/);
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

test('cookie options reject inherited, accessor, symbol and hidden extra properties without invoking getters', () => {
  const token = syntheticToken();
  const inherited = Object.create({ maxAgeSeconds: 30 });
  assert.throws(() => createReviewerSessionCookie(token, inherited), /plain object/);

  let getterCalled = false;
  const accessor = {};
  Object.defineProperty(accessor, 'maxAgeSeconds', {
    get() { getterCalled = true; return 30; }
  });
  assert.throws(() => createReviewerSessionCookie(token, accessor), /own data property/);
  assert.equal(getterCalled, false, 'option getter must not execute');

  const hiddenExtra = {};
  Object.defineProperty(hiddenExtra, 'domain', { value: 'example.test' });
  assert.throws(() => createReviewerSessionCookie(token, hiddenExtra), /Only maxAgeSeconds/);

  const symbolExtra = { [Symbol('unexpected')]: true };
  assert.throws(() => createReviewerSessionCookie(token, symbolExtra), /Only maxAgeSeconds/);

  const nullPrototype = Object.assign(Object.create(null), { maxAgeSeconds: 30 });
  assert.match(createReviewerSessionCookie(token, nullPrototype), /Max-Age=30/);
});

test('logout cookie clears the same __Host- cookie with matching security attributes', () => {
  assert.equal(clearReviewerSessionCookie(),
    COOKIE_NAME + '=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict');
  assert.doesNotMatch(clearReviewerSessionCookie(), /(?:^|; )Domain=/i);
  assert.ok(Buffer.byteLength(clearReviewerSessionCookie(), 'utf8') <= MAX_COOKIE_BYTES);
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
  const oversized = [valid.split('.')[0], Buffer.alloc(3000, 0x61).toString('base64url'), valid.split('.')[2]].join('.');
  assert.ok(oversized.length > MAX_TOKEN_LENGTH);
  assert.equal(isCanonicalCompactToken(oversized), false);
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(isCanonicalCompactToken(value), false);
    assert.throws(() => createReviewerSessionCookie(value), /canonical compact token/);
  }
  assert.throws(() => createReviewerSessionCookie('one.two'), /canonical compact token/);
});

test('maximum-length canonical token stays within the complete 4096-byte cookie budget', () => {
  const token = [
    Buffer.alloc(75, 0x41).toString('base64url'),
    Buffer.alloc(2771, 0x42).toString('base64url'),
    Buffer.alloc(2, 0x43).toString('base64url')
  ].join('.');
  assert.equal(token.length, MAX_TOKEN_LENGTH);
  assert.equal(isCanonicalCompactToken(token), true);

  const cookie = createReviewerSessionCookie(token);
  assert.ok(Buffer.byteLength(cookie, 'utf8') <= MAX_COOKIE_BYTES);
  assert.ok(Buffer.byteLength(cookie, 'utf8') < 4096);

  const oversizedToken = [
    Buffer.alloc(75, 0x41).toString('base64url'),
    Buffer.concat([Buffer.alloc(2771, 0x42), Buffer.from([0x44])]).toString('base64url'),
    Buffer.alloc(2, 0x43).toString('base64url')
  ].join('.');
  assert.equal(oversizedToken.length, MAX_TOKEN_LENGTH + 1);
  assert.equal(isCanonicalCompactToken(oversizedToken), false);
  assert.throws(() => createReviewerSessionCookie(oversizedToken), /canonical compact token/);
});
