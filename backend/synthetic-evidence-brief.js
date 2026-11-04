'use strict';
// Offline synthetic evidence organizer. No legal conclusions or official acts.
const TOPICS = new Set(['سرقت تعزیری','کلاهبرداری','چک','مطالبه وجه','طلاق','مهریه']);
const ROLES = new Set(['وکیل','قاضی','سردفتر','دادستان','ضابط']);
const STANCES = new Set(['موافق','مخالف','نامعلوم']);
function createSyntheticEvidenceBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !TOPICS.has(input.topic) || !ROLES.has(input.role) ||
      input.synthetic !== true || !Array.isArray(input.evidence) ||
      input.evidence.length > 12) throw new TypeError('synthetic_scope_required');
  const evidence = input.evidence.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !STANCES.has(item.stance) || typeof item.description !== 'string' ||
        !item.description.trim() || item.description.length > 250 ||
        /[\r\n\u2028\u2029]/u.test(item.description)) throw new TypeError('invalid_evidence_' + i);
    return Object.freeze({ index: i + 1, stance: item.stance, description: item.description.trim() });
  });
  const forClaim = evidence.filter(e => e.stance === 'موافق');
  const againstClaim = evidence.filter(e => e.stance === 'مخالف');
  const unresolved = evidence.filter(e => e.stance === 'نامعلوم');
  const gaps = [];
  if (!forClaim.length) gaps.push('دلیل موافق ادعا ثبت نشده است.');
  if (!againstClaim.length) gaps.push('دلیل مخالف یا دفاع احتمالی ثبت نشده است.');
  if (unresolved.length) gaps.push('اعتبار یا جهت برخی داده‌ها نامعلوم است.');
  gaps.push('اصالت، قابلیت استناد و تاریخ اعتبار منابع قانونی بررسی نشده است.');
  const rolePurpose = {
    'وکیل': 'سامان‌دهی پرسش‌ها و پیش‌نویس غیررسمی',
    'قاضی': 'مقایسه استدلال طرفین، بدون صدور رأی',
    'سردفتر': 'فهرست بررسی اولیه، بدون تنظیم یا ثبت سند رسمی',
    'دادستان': 'مقایسه ادعا و دفاع، بدون تصمیم قضایی',
    'ضابط': 'سامان‌دهی گزارش فرضی، بدون اقدام انتظامی',
  }[input.role];
  return Object.freeze({
    status: 'SYNTHETIC_ONLY', topic: input.topic, role: input.role,
    purpose: rolePurpose, forClaim, againstClaim, unresolved, gaps,
    legalSources: [], legalValidity: 'تأییدنشده',
    conclusion: 'هیچ نتیجه حقوقی قطعی از این داده‌ها استخراج نشده است.',
    review: 'استفاده حقوقی مستلزم بررسی اصل مدارک، متن مواد، منبع رسمی، تاریخ اعتبار و بازبینی متخصص انسانی است.',
  });
}
module.exports = { createSyntheticEvidenceBrief };
