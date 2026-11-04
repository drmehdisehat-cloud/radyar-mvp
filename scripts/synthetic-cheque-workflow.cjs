'use strict';
// Offline, synthetic-only cheque interview-to-draft workflow. No network or persistence.
const { createSyntheticEvidenceBrief } = require('../backend/synthetic-evidence-brief');
const fs = require('node:fs');
const MAX_BYTES = 16384;
function makeDraft(input) {
  if (!input || input.topic !== 'چک' || input.synthetic !== true ||
      !['وکیل','قاضی','سردفتر','دادستان','ضابط'].includes(input.role) ||
      typeof input !== 'object' || Array.isArray(input) ||
      !Array.isArray(input.evidence)) throw new TypeError('synthetic_scope_required');
  const brief = createSyntheticEvidenceBrief(input);
  const section = items => items.length
    ? items.map(e => '- ' + e.description).join('\n')
    : '- ثبت نشده';
  return {
    status: 'SYNTHETIC_ONLY',
    title: 'پیش‌نویس غیررسمی بررسی چک (صرفاً داده ساختگی)',
    role: brief.role,
    draft: [
      'موضوع: چک فرضی؛ هیچ ادعایی احراز نشده است.',
      'ادله موافق ادعا:\n' + section(brief.forClaim),
      'ادله مخالف ادعا:\n' + section(brief.againstClaim),
      'موارد نامعلوم:\n' + section(brief.unresolved),
      'پرسش‌های ضروری:\n' + brief.nextQuestions.map(q => '- ' + q).join('\n'),
      'منابع قانونی: تأیید نشده؛ استناد قانونی ارائه نمی‌شود.',
      'این پیش‌نویس رأی، سند رسمی یا دستور انتظامی نیست و نیازمند بازبینی انسانی است.'
    ].join('\n\n'),
    missing: brief.gaps,
    legalSources: [],
    humanReviewRequired: true
  };
}
function main() {
  let raw;
  try {
    raw = fs.readFileSync(0);
    if (raw.length > MAX_BYTES) throw new TypeError('input_too_large');
    const result = makeDraft(JSON.parse(raw.toString('utf8')));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (_) {
    process.stderr.write('invalid_synthetic_input\n');
    process.exitCode = 2;
  }
}
if (require.main === module) main();
module.exports = { makeDraft };
