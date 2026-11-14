'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseJsonRejectDuplicateKeys } = require('../scripts/strict-json.cjs');
const { readEvidence } = require('../scripts/preview-release-preflight.cjs');

test('rejects duplicate top-level evidence keys', () => {
  assert.throws(
    () => parseJsonRejectDuplicateKeys('{"schema":"first","schema":"second"}'),
    /duplicate_json_key:schema/
  );
});

test('rejects duplicate keys after JSON escape decoding', () => {
  assert.throws(
    () => parseJsonRejectDuplicateKeys('{"schema":1,"\\u0073chema":2}'),
    /duplicate_json_key:schema/
  );
});

test('rejects duplicate nested keys but permits the same key in sibling objects', () => {
  assert.throws(
    () => parseJsonRejectDuplicateKeys('{"review":{"decision":"approved","decision":"rejected"}}'),
    /duplicate_json_key:decision/
  );
  assert.deepEqual(
    parseJsonRejectDuplicateKeys('{"operator":{"name":"A"},"reviewer":{"name":"B"}}'),
    { operator: { name: 'A' }, reviewer: { name: 'B' } }
  );
});

test('does not mistake braces, commas or escaped quotes inside strings for JSON structure', () => {
  const value = { note: 'a } , and " quote', entries: [{ key: 'one' }, { key: 'two' }] };
  assert.deepEqual(parseJsonRejectDuplicateKeys(JSON.stringify(value)), value);
});

test('rejects excessive nesting and malformed trailing content', () => {
  assert.throws(
    () => parseJsonRejectDuplicateKeys('['.repeat(66) + '0' + ']'.repeat(66)),
    /json_nesting_too_deep/
  );
  assert.throws(() => parseJsonRejectDuplicateKeys('{"schema":1} trailing'));
  assert.throws(() => parseJsonRejectDuplicateKeys('{"schema":01}'));
});

test('release preflight evidence reader rejects duplicate keys before accepting a manifest', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-strict-json-'));
  const file = path.join(directory, 'restore-manifest.json');
  try {
    fs.writeFileSync(file, '{"evidence":"independent-restore-manifest-v1","restore_proven":false,"restore_proven":true}');
    assert.throws(
      () => readEvidence('--restore-evidence', file),
      /duplicate_json_key:restore_proven/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('restore-signature canonicalization CLI rejects duplicate manifest keys', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-signature-json-'));
  const manifest = path.join(directory, 'manifest.json');
  try {
    fs.writeFileSync(manifest, '{"restore_proven":false,"restore_proven":true}');
    const script = path.join(__dirname, '../scripts/verify-restore-attestation-signatures.cjs');
    const result = require('node:child_process').spawnSync(
      process.execPath,
      [script, '--canonicalize', '--manifest', manifest],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr + result.stdout, /duplicate_json_key:restore_proven/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned restore verifier rejects duplicate manifest keys before reading key files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-pinned-json-'));
  const manifest = path.join(directory, 'manifest.json');
  try {
    fs.writeFileSync(manifest, '{"restore_proven":false,"restore_proven":true}');
    const script = path.join(__dirname, '../scripts/verify-restore-attestation-pinned.cjs');
    const args = [
      script,
      '--manifest', manifest,
      '--operator-public-key', path.join(directory, 'missing-operator.pem'),
      '--operator-signature', path.join(directory, 'missing-operator.sig'),
      '--reviewer-public-key', path.join(directory, 'missing-reviewer.pem'),
      '--reviewer-signature', path.join(directory, 'missing-reviewer.sig'),
      '--expected-operator-public-key-sha256', 'a'.repeat(64),
      '--expected-reviewer-public-key-sha256', 'b'.repeat(64)
    ];
    const result = require('node:child_process').spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout + result.stderr, /duplicate_json_key:restore_proven/);
    assert.doesNotMatch(result.stdout + result.stderr, /ENOENT/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
