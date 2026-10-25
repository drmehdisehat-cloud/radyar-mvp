#!/usr/bin/env node
'use strict';
// Evidence inventory only. Passing this gate cannot certify legal accuracy,
// security or owner approval; independent human verification is mandatory.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
if (rootArg !== -1 && (!args[rootArg + 1] || args[rootArg + 1].startsWith('--'))) {
  console.error('Usage: check-v1-readiness.cjs [--enforce] [--root DIRECTORY]');
  process.exit(2);
}
const root = rootArg === -1 ? path.resolve(__dirname, '..') : path.resolve(args[rootArg + 1]);
const issues = [];
const expected = ['theft', 'fraud', 'check', 'debt', 'divorce', 'mehrieh'];
let sourced = 0;
let reviewed = 0;
try {
  const context = vm.createContext({ $: () => ({}) });
  for (const file of ['flows.js', 'export.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { timeout: 1000 });
  }
  const topics = JSON.parse(vm.runInContext(
    'JSON.stringify(Object.entries(flows).map(([id, f]) => ({ id, source: f.source || null })))',
    context, { timeout: 1000 }));
  const actual = topics.map(t => t.id);
  for (const id of expected) if (!actual.includes(id)) issues.push('missing_topic:' + id);
  for (const id of actual) if (!expected.includes(id)) issues.push('unexpected_topic:' + id);
  for (const topic of topics) {
    if (!topic.source) { issues.push('missing_legal_source:' + topic.id); continue; }
    context.candidate = topic.source;
    if (vm.runInContext('safeLawSource(candidate)', context, { timeout: 1000 }) !== true) {
      issues.push('unsafe_source_metadata:' + topic.id);
      continue;
    }
    // Display-safe official URLs are NOT necessarily direct legal documents.
    // Until document-specific patterns for other portals are verified, count
    // only a positive numeric qavanin TreeText document ID as source coverage.
    // This is still only structural evidence, never legal-text verification.
    if (!/^https:\/\/qavanin\.ir\/Law\/TreeText\/\?IDS=[1-9]\d*$/i.test(topic.source.url)) {
      issues.push('unverified_source_document_pattern:' + topic.id);
      continue;
    }
    sourced++;
    const review = topic.source.legalReview;
    const dateOk = date => typeof date === 'string' &&
      vm.runInContext('validReviewDate(candidate)', Object.assign(context, { candidate: date }), { timeout: 1000 }) === true;
    if (!review || !dateOk(review.effectiveDate) || !dateOk(review.reviewedAt) ||
        typeof review.reviewer !== 'string' || !review.reviewer.trim() ||
        review.reviewer.length > 120 ||
        /[\u0000-\u001F\u007F-\u009F\u061C\u200B\u200E-\u202E\u2060-\u206F\uFEFF]/u.test(review.reviewer) ||
        !['checked-current', 'checked-amended'].includes(review.amendmentStatus)) {
      issues.push('missing_human_legal_review:' + topic.id);
    } else if (review.effectiveDate > review.reviewedAt ||
               review.reviewedAt > topic.source.checked) {
      // ISO dates sort lexically. A future-effective rule or a review newer
      // than the last source-link check must not count as current evidence.
      issues.push('inconsistent_legal_review_dates:' + topic.id);
    } else reviewed++;
  }
} catch (error) {
  issues.push('source_inventory_unavailable:' + error.code?.toString().slice(0, 32) || 'invalid_source');
}
let uncheckedGates = 0;
try {
  const checklist = fs.readFileSync(path.join(root, 'docs/V1-RELEASE-GATES.md'), 'utf8');
  const lines = checklist.split(/\r?\n/);
  const gates = lines.filter(line => /^- \[[ xX]\] /.test(line));
  if (!gates.length) issues.push('release_checklist_empty');
  // Mandatory blockers must not disappear if checklist lines are deleted.
  // Checked boxes remain human attestations, not independently verified facts.
  const required = [
    ['local_sync', 'Sync reviewed local source'],
    ['ci', 'Add read-only GitHub Actions CI'],
    ['browser', 'Run real browser tests'],
    ['server_security', 'Verify server-side validation'],
    ['privacy', 'Review authentication'],
    ['legal_review', 'Cite authoritative Iranian legal texts'],
    ['owner_approval', 'Obtain explicit owner approval'],
  ];
  for (const [id, prefix] of required) {
    if (!gates.some(line => line.slice(6).startsWith(prefix))) {
      issues.push('missing_required_release_gate:' + id);
    }
  }
  for (const line of gates) {
    if (/^- \[ \] /.test(line)) {
      uncheckedGates++;
      issues.push('unchecked_release_gate:' + line.slice(6, 96));
    }
  }
} catch { issues.push('release_checklist_unavailable'); }
const status = issues.length ? 'NOT_READY' : 'EVIDENCE_CHECKS_PASSED';
console.log(JSON.stringify({ status, sourceCoverage: sourced + '/' + expected.length,
  humanReviewCoverage: reviewed + '/' + expected.length, uncheckedGates, issues }, null, 2));
if (args.includes('--enforce') && issues.length) process.exitCode = 1;
