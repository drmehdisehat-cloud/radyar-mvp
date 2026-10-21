# Experimental CI activation handoff (2026-10-21)

Verified experimental branch HEAD before this note: `8a48ca99c57895a96e9922a551cff484abd4d75f`.

## Verified blocker
The repository has `docs/ci-bootstrap.yml`, but no executable `.github/workflows/ci.yml`. GitHub Actions had zero runs when checked on 2026-10-21. An attempt to create the workflow via the connected GitHub integration was rejected by its safety controls. This document is not a CI run.

## Safe manual activation
1. Check out `dadyar/mvp-sync-028` and verify its remote HEAD before applying any changes. Do not edit `main` or production.
2. Review `docs/ci-bootstrap.yml`. It is scoped to experimental pushes, uses read-only contents permissions and disables persisted checkout credentials.
3. Copy that file to `.github/workflows/ci.yml` **on the experimental branch only**. Keep all referenced test files and the reviewed branch content unchanged.
4. Run the eight local commands in the workflow, inspect `git diff --check`, and commit/push only after review.
5. Confirm a real GitHub Actions run is green and matches the pushed commit SHA. A local test pass is not a CI success.
6. Before syncing the larger local package, compare the latest remote tree and preserve remote-only files. Check for credentials and case data.

## Release decision
No v1 release, public deployment, or client data until authentication, privacy, browser, legal-source validity and end-to-end security checks pass.
