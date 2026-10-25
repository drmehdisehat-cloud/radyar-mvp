# Dadyar v1 release gates (experimental branch only)

Status: NOT RELEASE READY. This document is a checklist, not proof of passing tests.

- [ ] Sync reviewed local source to experimental branch, with file-by-file SHA verification.
- [x] Add read-only GitHub Actions CI scoped to `dadyar/mvp-sync-028`; observe a green run.
- [x] Run real browser tests for role/topic intake, back/edit, report export, and privacy reset.
- [ ] Verify server-side validation, rate limiting, and origin controls in a staging environment.
- [ ] Review authentication, data retention, privacy notice, and handling of sensitive case data.
- [ ] Cite authoritative Iranian legal texts with effective/review dates and human legal review.
- [ ] Obtain explicit owner approval and backup before touching `main` or live deployment.

No client information, tokens, or keys may be committed.

## Verified experimental CI and browser evidence (2026-10-26)

- GitHub Actions run: https://github.com/drmehdisehat-cloud/radyar-mvp/actions/runs/40237127357
- Tested commit: `646eef68a36ae68a51b662e389bd82734ddf018a` on `dadyar/mvp-sync-028`.
- Successful job steps: source syntax, all committed contract tests, informational release-blocker audit, and real headless Chromium smoke test.
- Browser assertions include six phase-one topics × four roles, in-app Back and edit, saved report, explicit download consent, reset, and browser history Back. Synthetic data only.
- CI/browser checks are limited to this experimental commit and environment. They do not verify staging authentication, retention, legal accuracy, real-client privacy, owner approval, or production readiness.
- Unchecked gates remain blocking; do not merge to `main` or deploy without independent review, backup, and explicit approval.
