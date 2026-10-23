'use strict';
// Explicit opt-in only: never transmit case details on page load or interview steps.
// This prototype API is loopback-only and never persists case data.
(() => {
  const button = document.getElementById('validateLocal');
  const status = document.getElementById('validationStatus');
  const isLocal = location.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  button.disabled = !isLocal;
  if (!isLocal) {
    status.textContent = 'اعتبارسنجی سرور فقط روی localhost فعال است؛ اطلاعات شما ارسال نمی‌شود.';
    return;
  }
  let pending = null;
  function abortPending() {
    if (pending) { pending.abort(); pending = null; }
    button.disabled = false;
    status.textContent = 'اعتبارسنجی انجام نشده است.';
  }
  ['reset', 'cancel', 'editAnswers'].forEach(id =>
    document.getElementById(id).addEventListener('click', abortPending));
  window.addEventListener('pagehide', abortPending);
  window.addEventListener('pageshow', event => { if (event.persisted) abortPending(); });
  button.addEventListener('click', async () => {
    if (!state || pending || state.answers.length !== questionsFor(state.topic, state.role).length) return;
    if (!confirm('متن شرح و پاسخ‌ها برای اعتبارسنجی ساختاری به سرور محلی همین دستگاه ارسال می‌شود؛ هیچ داده‌ای ذخیره نمی‌شود. ادامه می‌دهید؟')) return;
    const current = state;
    const controller = new AbortController();
    pending = controller;
    button.disabled = true;
    status.textContent = 'در حال بررسی ساختار پرونده...';
    // A stalled request must not leave the UI indefinitely saying 'checking'.
    const timeout = setTimeout(() => {
      if (pending === controller) {
        status.textContent = 'مهلت پاسخ سرور محلی به پایان رسید؛ اعتبارسنجی انجام نشد.';
        controller.abort();
      }
    }, 5000);
    try {
      const response = await fetch('/api/cases/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        body: JSON.stringify({ topic: current.topic, role: current.role,
          story: current.story, answers: [...current.answers] }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (state !== current || controller.signal.aborted) return;
      if (response.ok && result.valid === true) {
        status.textContent = 'ساختار پرونده توسط API محلی تأیید شد؛ صحت حقوقی بررسی نشده است.';
      } else {
        status.textContent = 'ساختار پرونده تأیید نشد یا سرویس در دسترس نیست.';
      }
    } catch {
      if (state === current && pending === controller && !controller.signal.aborted) {
        status.textContent = 'اتصال به API محلی ناموفق بود؛ اطلاعاتی ذخیره نشده است.';
      }
    } finally {
      clearTimeout(timeout);
      if (pending === controller) { pending = null; button.disabled = false; }
    }
  });
})();
