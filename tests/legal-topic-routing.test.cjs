'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TOPIC_HINTS, normalizeTopicText, classifyLegalTopics } = require('../backend/legal-topic-routing');

test('the private assistant uses exactly 27 internal legal-domain hint groups', () => {
  assert.equal(TOPIC_HINTS.length, 27);
  assert.equal(new Set(TOPIC_HINTS.map(item => item.id)).size, 27);
  assert.ok(TOPIC_HINTS.every(item => Array.isArray(item.keywords) && item.keywords.length > 0));
});

test('free-text question can route to multiple domains without a user-selected category', () => {
  const topics = classifyLegalTopics('در سناریوی فرضی چک، اجاره و طلاق چه مدارکی باید بررسی شود؟');
  assert.deepEqual(new Set(topics), new Set(['instruments', 'property', 'family']));
});

test('multi-topic classification includes digital, criminal and civil hints', () => {
  const topics = classifyLegalTopics('در یک مثال فرضی کلاهبرداری اینترنتی و قرارداد چه وضعی دارد؟');
  assert.ok(topics.includes('digital'));
  assert.ok(topics.includes('criminal'));
  assert.ok(topics.includes('civil'));
});

test('Arabic and Persian letter variants normalize consistently', () => {
  assert.equal(normalizeTopicText('كلاهبرداری يک چك'), normalizeTopicText('کلاهبرداری یک چک'));
  assert.ok(classifyLegalTopics('چك ساختگی').includes('instruments'));
});

test('unmatched free text remains unclassified instead of forcing a category', () => {
  assert.deepEqual(classifyLegalTopics('پرسش ساختگی با واژه‌های نامرتبط و بی‌سرنخ'), []);
});
