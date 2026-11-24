'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const textPath = path.join(root, 'research/qavanin-1372-check-amendment-rendered-20261123.txt');
const observationPath = path.join(root, 'docs/check-law-qavanin-observation-20261123.json');
const renderedText = fs.readFileSync(textPath);
const observation = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
const capture = observation.renderedTextCapture;

test('rendered official cheque-amendment extract is byte-pinned as a repository transcription', () => {
  assert.equal(capture.path, 'research/qavanin-1372-check-amendment-rendered-20261123.txt');
  assert.equal(capture.sourceUrl, observation.source.textUrl);
  assert.equal(capture.captureType, 'web-rendered official portal text copied from visible lines');
  assert.equal(capture.sourceVisibleLineRange[0], 42);
  assert.equal(capture.sourceVisibleLineRange[1], 68);
  assert.equal(renderedText.length, capture.utf8Bytes);
  assert.equal(renderedText.toString('utf8').split(/\r?\n/).length, capture.lineCount);
  assert.equal(crypto.createHash('sha256').update(renderedText).digest('hex'), capture.sha256);
});

test('rendered transcription cannot be promoted to a verified legal source by its local hash', () => {
  assert.equal(capture.rawHttpResponseBytesCaptured, false);
  assert.equal(capture.rawResponseSha256, null);
  assert.match(capture.limitation, /not a digest of the raw HTTP response or the Official Gazette issue/i);
  assert.equal(observation.verification.rawHttpBytesCaptured, false);
  assert.equal(observation.verification.rawResponseSha256, null);
  assert.equal(observation.verification.officialGazetteIssueBytesRetrieved, false);
  assert.equal(observation.verification.primarySourceVerified, false);
  assert.equal(observation.verification.humanReviewStatus, 'pending');
  assert.equal(observation.verification.eventDateVersioningApproved, false);
  assert.equal(observation.verification.legalAnswerUsePermitted, false);
});
