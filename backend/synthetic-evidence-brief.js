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
    // Synthetic-only guard: reject common contact identifiers before generating a review pack.
    // This is a limited safeguard, not a guarantee that arbitrary personal data is absent.
    if (/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?98|0)9\d{9})/u.test(item.description))
      throw new TypeError('potential_personal_data_' + i);
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
  // Interview prompts are questions, not legal advice or conclusions.
  const topicQuestions = {
    'سرقت تعزیری': ['زمان و محل فرضی واقعه چیست؟', 'مالکیت و نحوه خروج مال چگونه مستند می‌شود؟'],
    'کلاهبرداری': ['اظهار خلاف واقع ادعایی دقیقاً چه بوده است؟', 'رابطه ادعایی میان فریب و انتقال مال چیست؟'],
    'چک': ['تاریخ صدور و سررسید فرضی چک چیست؟', 'گواهی عدم پرداخت فرضی و دلیل پرداخت احتمالی موجود است؟'],
    'مطالبه وجه': ['مبنای ادعایی دین و تاریخ سررسید چیست؟', 'پرداخت‌های احتمالی چگونه مستند شده‌اند؟'],
    'طلاق': ['خواسته دقیق و وضعیت فرضی رابطه زوجیت چیست؟', 'درباره حقوق مالی و فرزندان چه داده‌ای هنوز نامعلوم است؟'],
    'مهریه': ['نوع و میزان مهر در سند فرضی چیست؟', 'آیا پرداخت یا انتقال قبلی ادعا شده است؟'],
  };
  const nextQuestions = [...topicQuestions[input.topic]];
  if (!forClaim.length) nextQuestions.push('چه دلیل فرضی به سود ادعا وجود دارد؟');
  if (!againstClaim.length) nextQuestions.push('طرف مقابل چه دفاع یا دلیل فرضی می‌تواند ارائه کند؟');
  if (unresolved.length) nextQuestions.push('برای بررسی داده‌های نامعلوم چه مدرک فرضی دیگری لازم است؟');
  const rolePurpose = {
    'وکیل': 'سامان‌دهی پرسش‌ها و پیش‌نویس غیررسمی',
    'قاضی': 'مقایسه استدلال طرفین، بدون صدور رأی',
    'سردفتر': 'فهرست بررسی اولیه، بدون تنظیم یا ثبت سند رسمی',
    'دادستان': 'مقایسه ادعا و دفاع، بدون تصمیم قضایی',
    'ضابط': 'سامان‌دهی گزارش فرضی، بدون اقدام انتظامی',
  }[input.role];
  // Actionable interview handoff, not a legal finding. Missing opposing evidence
  // and unknown authenticity always remain visible to the reviewer.
  const handoff = Object.freeze({
    interviewComplete: forClaim.length > 0 && againstClaim.length > 0 && unresolved.length === 0,
    nextStep: !forClaim.length ? 'ابتدا ادله فرضی مؤید ادعا را گردآوری کنید.' :
      !againstClaim.length ? 'پیش از پیش‌نویس، دفاع و ادله احتمالی طرف مقابل را ثبت کنید.' :
      unresolved.length ? 'ابهام‌های ادله را با پرسش تکمیلی روشن کنید.' :
      'خلاصه فرضی را برای بازبینی انسانی و تطبیق با منابع رسمی آماده کنید.',
    publicationBlocked: true,
    publicationReason: 'منابع رسمی، تاریخ اعتبار و بازبینی انسانی هنوز تأیید نشده‌اند.',
  });
  return Object.freeze({
    handoff,
    status: 'SYNTHETIC_ONLY', topic: input.topic, role: input.role,
    purpose: rolePurpose, forClaim, againstClaim, unresolved, gaps, nextQuestions,
    legalSources: [], legalValidity: 'تأییدنشده',
    conclusion: 'هیچ نتیجه حقوقی قطعی از این داده‌ها استخراج نشده است.',
    review: 'استفاده حقوقی مستلزم بررسی اصل مدارک، متن مواد، منبع رسمی، تاریخ اعتبار و بازبینی متخصص انسانی است.',
  });
}
module.exports = { createSyntheticEvidenceBrief };
