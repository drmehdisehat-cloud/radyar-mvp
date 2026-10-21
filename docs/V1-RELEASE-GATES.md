# Dadyar v1 release gates (experimental branch only)

Status: NOT RELEASE READY. This document is a checklist, not proof of passing tests.

- [ ] Sync reviewed local source to experimental branch, with file-by-file SHA verification.
- [ ] Add read-only GitHub Actions CI scoped to `dadyar/mvp-sync-028`; observe a green run.
- [ ] Run real browser tests for role/topic intake, back/edit, report export, and privacy reset.
- [ ] Verify server-side validation, rate limiting, and origin controls in a staging environment.
- [ ] Review authentication, data retention, privacy notice, and handling of sensitive case data.
- [ ] Cite authoritative Iranian legal texts with effective/review dates and human legal review.
- [ ] Obtain explicit owner approval and backup before touching `main` or live deployment.

No client information, tokens, or keys may be committed.
