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
  const roleGuidance = {
  "وکیل": "یادداشت مصاحبه وکیل: ادعا و دفاع را جداگانه بررسی و مدارک لازم را برای بازبینی انسانی فهرست کنید.",
  "قاضی": "کاربرگ شبیه‌سازی قاضی: قوت و ضعف ادله دو طرف را بدون صدور رأی یا تعیین نتیجه مقایسه کنید.",
  "سردفتر": "چک‌لیست سردفتر: اصالت اسناد و هویت اشخاص صرفاً نیازمند بررسی بعدی است؛ هیچ سندی ثبت نمی‌شود.",
  "دادستان": "کاربرگ شبیه‌سازی دادستان: عناصر ادعایی و دفاع احتمالی را بدون اتخاذ تصمیم قضایی بررسی کنید.",
  "ضابط": "گزارش فرضی ضابط: ترتیب وقایع و منشأ ادله را ثبت کنید؛ هیچ اقدام انتظامی انجام نمی‌شود."
};
  const section = items => items.length
    ? items.map(e => '- ' + e.description).join('\n')
    : '- ثبت نشده';
  return {
    status: 'SYNTHETIC_ONLY',
    title: 'پیش‌نویس غیررسمی بررسی چک (صرفاً داده ساختگی)',
    role: brief.role,
    roleGuidance: roleGuidance[brief.role],
    interview: brief.handoff,
    readyForHumanReview: brief.handoff.interviewComplete,
    workflowState: brief.handoff.interviewComplete ? 'AWAITING_LEGAL_SOURCE_REVIEW' : 'NEEDS_MORE_INFORMATION',
    draft: [
      roleGuidance[brief.role],
      'وضعیت مصاحبه: ' + (brief.handoff.interviewComplete ? 'ادله دو طرف ثبت شده؛ اصالت هنوز بررسی نشده است.' : 'ناقص؛ این متن صرفاً یادداشت اولیه است.'),
      'اقدام بعدی: ' + brief.handoff.nextStep,
      'موضوع: چک فرضی؛ هیچ ادعایی احراز نشده است.',
      'ادله موافق ادعا:\n' + section(brief.forClaim),
      'ادله مخالف ادعا:\n' + section(brief.againstClaim),
      'موارد نامعلوم:\n' + section(brief.unresolved),
      'پرسش‌های ضروری:\n' + brief.nextQuestions.map(q => '- ' + q).join('\n'),
      'منابع قانونی: تأیید نشده؛ استناد قانونی ارائه نمی‌شود.',
      'این پیش‌نویس رأی، سند رسمی یا دستور انتظامی نیست و نیازمند بازبینی انسانی است.'
    ].join('\n\n'),
    missing: brief.gaps,
    // Structured, unverified evidence-review tasks for the next human reviewer.
    // No legal conclusion, provenance verification, or automated approval.
    reviewTasks: [
      ...brief.forClaim.map(e => ({ evidenceIndex: e.index, side: 'موافق', verified: false,
        action: 'اصل مدرک فرضی، منشأ و ارتباط آن با ادعا را توسط انسان بررسی کنید.' })),
      ...brief.againstClaim.map(e => ({ evidenceIndex: e.index, side: 'مخالف', verified: false,
        action: 'دفاع احتمالی و اصالت مدرک فرضی را مستقل بررسی کنید.' })),
      ...brief.unresolved.map(e => ({ evidenceIndex: e.index, side: 'نامعلوم', verified: false,
        action: 'جهت و اعتبار داده نامعلوم را با پرسش تکمیلی روشن کنید.' }))
    ],
    legalSources: [],
    publicationBlocked: true,
    publicationReason: brief.handoff.publicationReason,
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
