'use strict';
// Accessible, local-only companion. No audio capture, network request or AI inference.
(function () {
  const root = document.querySelector('[data-dadyar-companion]');
  if (!root) return;
  const toggle = root.querySelector('[data-companion-toggle]');
  const panel = root.querySelector('[data-companion-panel]');
  const close = root.querySelector('[data-companion-close]');
  const focusTarget = root.querySelector('[data-companion-focus]');
  if (!toggle || !panel || !close || !focusTarget) return;
  function setOpen(open, returnFocus = false) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) close.focus();
    else if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false, true));
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false, true); }
  });
  focusTarget.addEventListener('click', () => {
    setOpen(false);
    const message = document.getElementById('message');
    if (message) message.focus();
  });
  setOpen(false);
})();
