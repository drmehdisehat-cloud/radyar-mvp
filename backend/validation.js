'use strict';

// Contract-only validation. This module never stores, logs, or sends case data.
const TOPICS = new Set(['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh']);
const ROLES = new Set(['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']);
// Reject invisible formatting that can disguise case facts in exported reports.
// Preserve normal Persian text, ZWNJ (U+200C), newlines and ordinary direction marks.
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\u2060\u2066-\u206F\uFEFF]/u;
// JSON can contain escaped lone UTF-16 surrogates. Reject them rather than
// silently replacing case evidence with U+FFFD during UTF-8 export/transport.
// for...of treats a valid surrogate pair as one Unicode scalar value.
function hasUnpairedSurrogate(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return true;
  }
  return false;
}
// Reject answers made only of invisible format characters or punctuation.
// Normal Persian half-spaces and ordinary punctuation remain valid within text.
const HAS_SEMANTIC_CONTENT = /[\p{L}\p{N}]/u;
// Best-effort privacy guard: block likely full 16-digit payment-card numbers.
// Luhn + exact 16-digit counting handles uneven grouping without partial 20-digit matches.
 // This is not comprehensive PII detection or a substitute for redaction.
const CARD_CANDIDATE = /(?<![0-9۰-۹٠-٩])(?<![0-9۰-۹٠-٩][ \t\u00A0\u202F\u2009\u2010-\u2013-]+)[0-9۰-۹٠-٩](?:[ \t\u00A0\u202F\u2009\u2010-\u2013-]*[0-9۰-۹٠-٩]){15}(?![0-9۰-۹٠-٩]|[ \t\u00A0\u202F\u2009\u2010-\u2013-]+[0-9۰-۹٠-٩])/gu;
function hasLikelyPaymentCardNumber(value) {
  for (const match of value.matchAll(CARD_CANDIDATE)) {
    const digits = match[0]
      .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
      .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[ \t\u00A0\u202F\u2009\u2010-\u2013-]/g, '');
    let checksum = 0;
    for (let index = digits.length - 1, double = false; index >= 0; index--, double = !double) {
      let digit = digits.charCodeAt(index) - 48;
      if (double) { digit *= 2; if (digit > 9) digit -= 9; }
      checksum += digit;
    }
    if (checksum % 10 === 0) return true;
  }
  return false;
}

function safeText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min &&
    value.length <= max && HAS_SEMANTIC_CONTENT.test(value) &&
    !UNSAFE_TEXT.test(value) && !hasUnpairedSurrogate(value) &&
    !hasLikelyPaymentCardNumber(value);
}

// Read only own *data* properties. Accessors must never execute while
// validating a case passed by another module. Parsed JSON remains unaffected.
function ownData(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function ownEnumerableData(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value')
    ? descriptor.value : undefined;
}

const ANSWER_ARRAY_KEYS = new Set(['0', '1', '2', '3', '4', 'length']);

function validateCase(payload) {
  try {
    const errors = [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, errors: ['payload'] };
    }
    if (!TOPICS.has(ownEnumerableData(payload, 'topic'))) errors.push('topic');
    if (!ROLES.has(ownEnumerableData(payload, 'role'))) errors.push('role');
    if (!safeText(ownEnumerableData(payload, 'story'), 10, 5000)) errors.push('story');
    const answers = ownEnumerableData(payload, 'answers');
    if (!Array.isArray(answers) || ownData(answers, 'length') !== 5 ||
        Reflect.ownKeys(answers).some(key => !ANSWER_ARRAY_KEYS.has(key)) ||
        Array.from({ length: 5 }, (_, index) => index).some(index =>
          !safeText(ownEnumerableData(answers, String(index)), 1, 2000))) {
      errors.push('answers');
    }
    // Reject unexpected fields to avoid silently accepting personal identifiers or secrets.
    if (Reflect.ownKeys(payload).some(key => !['topic', 'role', 'story', 'answers'].includes(key))) {
      errors.push('unexpected_fields');
    }
    return { valid: errors.length === 0, errors };
  } catch {
    // Revoked proxies and hostile descriptor traps are not valid case objects.
    return { valid: false, errors: ['payload'] };
  }
}
module.exports = { validateCase };
