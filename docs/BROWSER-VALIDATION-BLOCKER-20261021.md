# Experimental branch browser validation blocker (2026-10-21)

Status: OPEN. Do not deploy or use with real case data.

Verified source: `app.js` blob `4b456b44223cdfab874252ded63c364da86f8b9a` on `dadyar/mvp-sync-028`.

The current browser code only enforces a 10-character minimum for the story and nonempty answers. It does not apply the backend's 5000-character story and 2000-character answer limits, or reject control characters, bidi overrides and lone UTF-16 surrogates.

Local regression: `node tests/client-validation-parity.test.cjs` fails with "Browser text validator is absent" when run against the exact GitHub app.js blob, and passes 38 comparisons after applying the reviewed local app.js patch. These are local results, not GitHub Actions results.

Release gate:
- Sync a reviewed client-side validation patch to the experimental branch only.
- Add the parity test and a read-only GitHub Actions workflow.
- Confirm a green workflow run and a real-browser intake test.
- Do not change main or deploy without owner approval, backup and security review.

No real client facts or credentials are included.
