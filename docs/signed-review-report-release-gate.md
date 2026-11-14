# Dadyar signed-review report release gate

## Scope

`backend/review-release-gate.cjs` is a server-side orchestration boundary that joins the existing Ed25519 review verifier to report release. It does not add a network route or enable the local development API.

The gate requires all of the following dependencies to be provided by a future server deployment:

- `authenticateReviewer(request)`: a real server-side identity provider that returns only an opaque authenticated principal ID. A browser-supplied reviewer name or ID is not accepted as identity.
- `isIndependentReviewer(context)`: a policy check that returns exactly `true` only when the authenticated reviewer is independent of the report author and deployer.
- `loadReleaseMaterial()`: server-controlled immutable bytes for the full source commit, preview artifact and reviewed report. The gate computes both SHA-256 hashes itself; it does not accept hashes from the request.
- an explicitly configured trusted Ed25519 key registry and durable atomic nonce store.

The release function returns a copy of the report bytes only after identity, reviewer independence, source commit, artifact hash, report hash, decision, key status, signature, timestamp and one-use nonce checks all pass. Any missing dependency or indeterminate policy result fails closed.

## Tests

`tests/review-release-gate.test.cjs` uses ephemeral keys and synthetic bytes only. It covers:

- unauthenticated requests do not load report material;
- author/deployer cannot review their own report;
- exact signed approval releases only server-loaded report bytes;
- artifact or report substitution blocks release;
- a signed rejection blocks release;
- the same approval cannot release twice;
- unexpected release-material fields are rejected.

The focused preview workflow runs this suite. Stage-0 also discovers it through `node --test tests/*.test.cjs`.

## Explicit limitations

This is an integration contract, not a deployed authentication system. No identity provider, reviewer account, real key custody, production trust registry, HTTP download route, cPanel integration, TLS/session/CSRF implementation or multi-host nonce database is provisioned. The existing offline preview's name/checkbox review remains an unauthenticated local demonstration.

Do not expose this gate publicly or enable API based on its synthetic tests. Before any use, provision an independently verified reviewer identity, configure key custody and revocation, implement the server route with secure session controls, review privacy/retention, restore and validate the isolated backup, verify destination files, and obtain explicit owner release authorization.
