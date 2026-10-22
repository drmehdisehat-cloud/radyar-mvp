'use strict';

// Contract-only validation. This module never stores, logs, or sends case data.
const TOPICS = new Set(['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh']);
const ROLES = new Set(['خواهان / شاکی', 'خوانده / متهم', 'وکیل', 'شاهد']);
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u202A-\u202E\u2060\u2066-\u206F\uFEFF]/u;
function hasUnpairedSurrogate(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return true;
  }
  return false;
}
const HAS_SEMANTIC_CONTENT = /[\p{L}\p{N}]/u;
function safeText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min &&
    value.length <= max && HAS_SEMANTIC_CONTENT.test(value) &&
    !UNSAFE_TEXT.test(value) && !hasUnpairedSurrogate(value);
}
function validateCase(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['payload'] };
  }
  if (!Object.hasOwn(payload, 'topic') || !TOPICS.has(payload.topic)) errors.push('topic');
  if (!Object.hasOwn(payload, 'role') || !ROLES.has(payload.role)) errors.push('role');
  if (!Object.hasOwn(payload, 'story') || !safeText(payload.story, 10, 5000)) {
    errors.push('story');
  }
  if (!Object.hasOwn(payload, 'answers') || !Array.isArray(payload.answers) ||
      payload.answers.length !== 5 ||
      Array.from({ length: 5 }, (_, index) => index).some(index =>
        !Object.hasOwn(payload.answers, index) || !safeText(payload.answers[index], 1, 2000))) {
    errors.push('answers');
  }
  if (Object.keys(payload).some(key => !['topic', 'role', 'story', 'answers'].includes(key))) {
    errors.push('unexpected_fields');
  }
  return { valid: errors.length === 0, errors };
}
module.exports = { validateCase };
