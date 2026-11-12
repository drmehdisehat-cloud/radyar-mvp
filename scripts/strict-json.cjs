'use strict';

// Strict JSON evidence parser. JSON.parse silently accepts duplicate object keys;
// release manifests must not have ambiguous signed or reviewer-visible fields.
function parseJsonRejectDuplicateKeys(source) {
  if (typeof source !== 'string') throw new TypeError('json_source_must_be_string');
  let index = 0;
  const length = source.length;
  const fail = reason => { throw new SyntaxError(reason); };

  function whitespace() {
    while (index < length && /[\u0020\u0009\u000a\u000d]/.test(source[index])) index++;
  }

  function stringValue() {
    const start = index;
    if (source[index] !== '"') fail('invalid_json_string');
    index++;
    while (index < length) {
      const code = source.charCodeAt(index);
      if (code === 0x22) {
        index++;
        try { return JSON.parse(source.slice(start, index)); }
        catch { fail('invalid_json_string'); }
      }
      if (code === 0x5c) {
        index++;
        if (index >= length) fail('invalid_json_escape');
        const escaped = source[index++];
        if (escaped === 'u') {
          const hex = source.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid_json_escape');
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escaped)) {
          fail('invalid_json_escape');
        }
        continue;
      }
      if (code <= 0x1f) fail('invalid_json_string');
      index++;
    }
    fail('unterminated_json_string');
  }

  function value(depth) {
    if (depth > 64) fail('json_nesting_too_deep');
    whitespace();
    const char = source[index];
    if (char === '{') return object(depth + 1);
    if (char === '[') return array(depth + 1);
    if (char === '"') { stringValue(); return; }
    const rest = source.slice(index);
    for (const literal of ['true', 'false', 'null']) {
      if (rest.startsWith(literal)) { index += literal.length; return; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) { index += number[0].length; return; }
    fail('invalid_json_value');
  }

  function object(depth) {
    index++;
    whitespace();
    if (source[index] === '}') { index++; return; }
    const keys = new Set();
    while (index < length) {
      whitespace();
      const key = stringValue();
      if (keys.has(key)) fail('duplicate_json_key:' + key);
      keys.add(key);
      whitespace();
      if (source[index] !== ':') fail('invalid_json_object');
      index++;
      value(depth);
      whitespace();
      if (source[index] === '}') { index++; return; }
      if (source[index] !== ',') fail('invalid_json_object');
      index++;
      whitespace();
      if (source[index] === '}') fail('invalid_json_object');
    }
    fail('unterminated_json_object');
  }

  function array(depth) {
    index++;
    whitespace();
    if (source[index] === ']') { index++; return; }
    while (index < length) {
      value(depth);
      whitespace();
      if (source[index] === ']') { index++; return; }
      if (source[index] !== ',') fail('invalid_json_array');
      index++;
    }
    fail('unterminated_json_array');
  }

  value(0);
  whitespace();
  if (index !== length) fail('trailing_json_content');
  return JSON.parse(source);
}

module.exports = { parseJsonRejectDuplicateKeys };
