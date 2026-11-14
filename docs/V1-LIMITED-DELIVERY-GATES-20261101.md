# Dadyar limited v1: delivery gates and single-base plan

Status: **NOT_READY**. This is a release decision record, not evidence of completed implementation. Updated 2026-11-01. Do not merge into `main` or publish an API without separate owner approval.

## Product boundary
Persian-language **simulation and drafting assistant**, not an official lawyer, judge, prosecutor, notary or police authority. No binding verdict, registered instrument or actual enforcement action. Every legal conclusion must expose uncertainty, verified statutory text, official source, effective date, and human review requirement.

Phase 1 only: discretionary theft, conventional/online fraud, cheque, monetary claims, divorce and mahr. Later phases are out of scope for limited v1.

## Execution order and evidence required
1. **Choose one integration base.** Inventory the open stacked PRs (#3, #6, #7) and branch divergence. Record exact base/head SHAs, CI on the chosen SHA, and resolve red CI before adding features. No independent merges of stacked PRs; no `main` change.
2. **One end-to-end synthetic case.** Pick one phase-one scenario (e.g. cheque). From role selection through intake, document checklist, jurisdiction *with uncertainty*, adversarial evidence assessment, reviewable draft and safe export, demonstrate a single reproducible browser test. Never collect actual client records.
3. **Private staging identity.** Implement server-side authentication/authorization and session lifecycle, denied anonymous access tests, TLS, abuse controls, retention/deletion policy, separate synthetic storage and protected staging. Existing loopback development API and disconnected preview bearer helpers are not deployment-ready authentication.
4. **Operational validation.** Confirm isolated Node runtime, backup restoration evidence, rollback, browser/mobile accessibility, threat-model review, automated and manual security tests, CI green on the final staging commit.
5. **Verified legal references.** For each of six topics record official document URL, exact statutory text, article number, publication/amendment/effective dates, applicability and a named human legal review. A plausible URL or manually supplied date is not proof.
6. **Role simulation.** Test lawyer, judge, notary, prosecutor and police assistant roles for clear non-official labels, scope restrictions, evidence for/against, citations, uncertainty and human review. Do not promise full subject-matter coverage in each role without tested examples.
7. **Owner decision.** Produce a dated go/no-go report with links to exact CI run, browser tests, host evidence, backup restoration evidence, security review, legal sign-off and staging demo. Only then request separate release approval.

## Acceptance criteria
- One synthetic full journey works on mobile and desktop with tested export; no unsafe real-data persistence.
- Anonymous access to private staging and all protected APIs is rejected in integration tests; no secrets or client data in Git history.
- All six phase-one subjects have independently validated current primary-law citations and human sign-off, or are explicitly disabled in the limited release.
- Final exact SHA has green CI, security review and documented rollback; independent staging is verified.
- Explicit owner approval before any `main` merge, public API, live DNS change or full launch.

## Current evidence and unknowns
- Prior observed experimental commit `f3a560352448d5c3c59bb4667e0cf05cb30302ee`: GitHub Actions run `41266971235` succeeded (2026-11-01 inspection). This is **not** proof of release readiness.
- The independent local v0.30 codebase is not verified here. No staging deployment, host capability, backup restore, authenticated server, six-topic legal review, or human sign-off is confirmed.
- Next implementation task: inspect the current branch and PR stack, choose the single base, and build the cheque synthetic end-to-end journey rather than accumulating isolated security tests.
