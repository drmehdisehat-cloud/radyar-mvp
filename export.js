'use strict';
// Display safety only: official-looking links are not proof that a law is current.
const OFFICIAL_LAW_LINK = /^https:\/\/(?:qavanin\.ir|dotic\.ir|rc\.majlis\.ir)\/[^\s"'<>\\]*$/i;
function validReviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && value <= new Date().toISOString().slice(0, 10);
}
// Reject invisible, bidi and terminal control characters in trusted legal-source metadata.
// A domain allowlist alone cannot prevent misleading report headings.
const UNSAFE_SOURCE_METADATA = /[\u0000-\u001F\u007F-\u009F\u200B\u2028-\u202E\u2060-\u206F\uFEFF]/u;
function safeLawSource(source) {
  return !!source && typeof source === 'object' &&
    typeof source.title === 'string' && source.title.trim().length > 0 &&
    source.title.length <= 160 && !UNSAFE_SOURCE_METADATA.test(source.title) &&
    typeof source.url === 'string' && !UNSAFE_SOURCE_METADATA.test(source.url) &&
    OFFICIAL_LAW_LINK.test(source.url) && validReviewDate(source.checked);
}
function unresolvedQuestions() {
  if (!state) return [];
  return questionsFor(state.topic, state.role).filter((q, i) => state.answers[i] === 'نامشخص');
}
// Prevent user-authored multiline text from impersonating trusted report headings.
function quoteCaseText(value) {
  return String(value).split(/\r\n|[\r\n\u0085\u2028\u2029]/u)
    .map(line => '│ ' + line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu, ''))
    .join('\n');
}
function report() {
  const f = flows[state.topic];
  return [
    'گزارش آزمایشی دادیار',
    'خطوط با پیشوند «│» اظهارات کاربرند؛ صحت آن‌ها بررسی نشده است.',
    'موضوع: ' + f.title,
    'نقش: ' + state.role,
    'شرح اعلامی کاربر:', quoteCaseText(state.story),
    '', 'پاسخ‌های مصاحبه:',
    ...questionsFor(state.topic, state.role).map((q, i) => `${i + 1}. ${q}\nپاسخ اعلامی کاربر:\n${quoteCaseText(state.answers[i])}`),
    ...(unresolvedQuestions().length ? ['', 'اطلاعات تکمیل‌نشده (نیازمند پیگیری):', ...unresolvedQuestions().map(x => '• ' + x)] : []),
    '', 'مدارک احتمالی برای بررسی:', ...f.docs.map(x => '• ' + x),
    ...(safeLawSource(f.source) ? ['', 'پیوند به پایگاه رسمی برای مطالعه (اعتبار حقوقی تأیید نشده):', f.source.title, f.source.url, 'تاریخ درج‌شده در داده‌های آزمایشی (نه تاریخ اعتبار قانون): ' + f.source.checked, 'متن تنقیح‌شده، اصلاحات، نسخ و قابلیت استناد در پرونده بررسی نشده است.'] : []),
    '', 'تذکر: این گزارش صرفاً جمع‌آوری اطلاعات است و مشاوره حقوقی، تشخیص صلاحیت یا پیش‌بینی رأی نیست.'
  ].join('\n');
}
function finish() {
  const f = flows[state.topic], summary = $('summary');
  summary.replaceChildren();
  function section(title, body) {
    const div = document.createElement('div');
    div.className = 'item';
    const b = document.createElement('strong');
    b.textContent = title;
    const p = document.createElement('div');
    p.textContent = body;
    div.append(b, p);
    summary.append(div);
  }
  section('موضوع و نقش', f.title + ' | ' + state.role);
  section('شرح اولیه', state.story);
  questionsFor(state.topic, state.role).forEach((q, i) => section(q, state.answers[i]));
  if (unresolvedQuestions().length) section('اطلاعات تکمیل‌نشده', unresolvedQuestions().join('؛ '));
  section('مدارک احتمالی', f.docs.join('، '));
  if (safeLawSource(f.source)) {
    const box = document.createElement('div');
    box.className = 'item';
    const heading = document.createElement('strong');
    heading.textContent = 'پیوند به پایگاه رسمی (اعتبار حقوقی تأیید نشده)';
    const link = document.createElement('a');
    link.textContent = f.source.title;
    link.href = f.source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    const note = document.createElement('div');
    note.textContent = 'تاریخ درج‌شده در داده‌های آزمایشی: ' + f.source.checked + '؛ این تاریخ، تاریخ اعتبار قانون نیست. متن تنقیح‌شده، اصلاحات و قابلیت استناد بررسی نشده است.';
    box.append(heading, link, note);
    summary.append(box);
  }
  show('results');
}
$('download').onclick = () => {
  if (!state) return;
  if (!confirm('گزارش شامل شرح و پاسخ‌های پرونده است و پس از دانلود روی دستگاه باقی می‌ماند. آیا مایل به ذخیره فایل هستید؟')) return;
  const blob = new Blob(['\ufeff' + report()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = 'dadyar-case-report.txt';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
