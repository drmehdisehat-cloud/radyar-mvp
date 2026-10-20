'use strict';

// Contract-only validation. This module never stores, logs, or sends case data.
const TOPICS = new Set(['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh']);
const ROLES = new Set(['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']);
// Reject invisible formatting that can disguise case facts in exported reports.
// Preserve normal Persian text, ZWNJ (U+200C), newlines and ordinary direction marks.
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u202A-\u202E\u2060\u2066-\u206F\uFEFF]/u;
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
function safeText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min &&
    value.length <= max && !UNSAFE_TEXT.test(value) && !hasUnpairedSurrogate(value);
}

function validateCase(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['payload'] };
  }
  if (!TOPICS.has(payload.topic)) errors.push('topic');
  if (!ROLES.has(payload.role)) errors.push('role');
  if (!safeText(payload.story, 10, 5000)) {
    errors.push('story');
  }
  if (!Array.isArray(payload.answers) || payload.answers.length !== 5 ||
      payload.answers.some(a => !safeText(a, 1, 2000))) {
    errors.push('answers');
  }
  // Reject unexpected fields to avoid silently accepting personal identifiers or future secrets.
  if (Object.keys(payload).some(key => !['topic', 'role', 'story', 'answers'].includes(key))) {
    errors.push('unexpected_fields');
  }
  return { valid: errors.length === 0, errors };
}
module.exports = { validateCase };
