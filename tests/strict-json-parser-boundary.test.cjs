'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonRejectDuplicateKeys: parse } = require('../scripts/strict-json.cjs');

test('accepts representative valid JSON exactly as JSON.parse does', () => {
  const values = [
    null, true, false, 0, -0, 1, -1, 1.25, -12.5, 1e9, -2.5e-7,
    '', 'فارسی نیم‌فاصله', 'quote: " slash: \\ newline:\n tab:\t',
    'unicode: \u2028 and \u2029',
    [], {}, [null, true, false, 0, -1, 1.5, 'x'],
    { schema: 'v1', nested: { reviewer: 'synthetic', active: true }, list: [1, 2, 3] },
    { 'a"b': 'escaped key', 'slash\\key': 'value', 'newline\nkey': 'value' },
    { long: 'x'.repeat(4096), nested: Array.from({ length: 32 }, (_, i) => ({ index: i, ok: i % 2 === 0 })) }
  ];
  for (const value of values) {
    const source = JSON.stringify(value);
    assert.deepStrictEqual(parse(source), JSON.parse(source));
  }
});

test('accepts exactly 64 nested arrays and rejects 65', () => {
  const accepted = '['.repeat(64) + '0' + ']'.repeat(64);
  assert.deepStrictEqual(parse(accepted), JSON.parse(accepted));
  const rejected = '['.repeat(65) + '0' + ']'.repeat(65);
  assert.throws(() => parse(rejected), /json_nesting_too_deep/);
});

test('rejects malformed JSON grammar and trailing content', () => {
  const invalid = [
    '', ' ', 'undefined', 'NaN', 'Infinity', '+1', '.1', '01', '-01', '1.', '1e', '1e+',
    '--1', 'true false', 'nullx', '[1,]', '[1 2]', '[true false]',
    '{"a":}', '{"a" 1}', '{"a":1 "b":2}', '{"a":1,}', '{a:1}',
    '{"a":1} trailing', '[1]]', '{"a":1'
  ];
  for (const source of invalid) assert.throws(() => parse(source), undefined, `accepted invalid JSON: ${source}`);
});

test('rejects invalid string escapes and unescaped control characters', () => {
  const invalid = ['"\\x"', '"\\u12G4"', '"\\u123"', '"\\"', '"line\nbreak"', '"tab\tchar"'];
  for (const source of invalid) assert.throws(() => parse(source), undefined, `accepted invalid string: ${source}`);
});

test('rejects duplicate decoded keys at every object level, including inside arrays', () => {
  const invalid = [
    '{"x":1,"x":2}',
    '{"x":1,"\\u0078":2}',
    '{"outer":{"x":1,"x":2}}',
    '{"items":[{"decision":"approved","decision":"rejected"}]}',
    '{"a\\u0062":1,"ab":2}'
  ];
  for (const source of invalid) assert.throws(() => parse(source), /duplicate_json_key:/);
});

test('allows identical keys in sibling objects and enforces the JSON whitespace set', () => {
  const source = ' \r\n\t{"left":{"name":"A"},"right":{"name":"B"}} \n';
  assert.deepStrictEqual(parse(source), { left: { name: 'A' }, right: { name: 'B' } });
  assert.throws(() => parse('\u00a0{"x":1}'));
});
