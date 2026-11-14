# Dadyar reviewed-report HTTP adapter

## What this adds

`backend/review-release-http-handler.cjs` exposes a small Node HTTP adapter for the existing signed-review release gate at:

`POST /api/dadyar/review-report`

Mount the handler with `createReviewReleaseHttpServer(handler)`, not a bare `http.createServer(handler)`. The factory intercepts Node's `checkContinue` and `checkExpectation` events and rejects `Expect` requests with HTTP 417 before an interim `100 Continue` can invite a client to upload a body. The handler also rejects an `Expect` header if mounted directly, but a bare Node server may already have sent the interim response; the factory is therefore part of the required integration contract.

The adapter:
- requires the exact configured HTTPS `Origin`;
- rejects cross-site Fetch Metadata when supplied;
- accepts only UTF-8 JSON and rejects compressed bodies;
- caps request and response sizes and enforces a total request-body deadline (10 seconds by default, configurable only from 50 to 30,000 ms); a stalled or oversized body is answered with a bounded error and the connection is closed;
- accepts only a single `envelope` field (never caller-supplied reviewer IDs or hashes);
- compares the raw request target byte-for-byte with the configured canonical path before URL parsing, rejecting dot-segment, backslash, duplicate-slash and percent-encoded aliases;
- passes the actual server request to the injected release gate so the configured session authenticator can resolve the principal;
- returns the report only after the gate succeeds;
- applies no-store, nosniff, no-referrer and same-origin response headers;
- does not enable CORS and does not expose GET/OPTIONS routes.

## Important boundary

This is an HTTP adapter and integration test, **not a deployed endpoint**. The repository still has no real identity provider, reviewer session, key custody, production trust registry, production storage loader, or cPanel server wiring. The offline static preview remains offline and its checkbox/name flow remains a local demonstration. Do not connect the static preview to this endpoint until the identity and server dependencies below have been provisioned and independently reviewed.

## Required production dependencies

A deployment must inject:
1. A real server-side identity provider that validates a secure session. Never derive identity from a request body, query string, or reviewer-name header.
2. Secure session cookies (`Secure`, `HttpOnly`, appropriate `SameSite`), session rotation and expiry, and CSRF controls. The adapter's exact Origin and Fetch Metadata checks are defense in depth, not a replacement for session security.
3. An independence policy based on trusted server-side author/deployer records.
4. Immutable report and artifact storage outside the public document root.
5. A pinned Ed25519 reviewer-key registry with verified identity binding, custody, revocation and rotation.
6. A durable atomic nonce store. The current file adapter is single-host/local-filesystem only; do not use it behind multiple app instances or network filesystems without a separately reviewed shared store.
7. HTTPS termination at a trusted proxy. The proxy must overwrite, not merely append, forwarding headers.
8. Rate limiting, bounded request timeouts, monitoring and privacy-safe operational logs.

The allowed origin must be the exact canonical HTTPS origin, for example `https://mehdisehat.ir`, without a path or trailing slash. Do not place private keys, session secrets, reviewer records or report files in Git or the public web root.

## Hosting decision

Before implementation on IranHost, confirm whether the selected hosting plan supports a continuously running Node.js application and a private writable directory outside the document root. If it does not, use a separately hosted backend or commission an independently reviewed equivalent adapter in the host's supported runtime. Do not try to simulate a protected server route with static JavaScript or an `.htaccess` rewrite to a file.

## Tests

`tests/review-release-http-handler.test.cjs` starts a real ephemeral local HTTP server and uses only generated Ed25519 keys, synthetic sessions, a synthetic cheque report and in-memory test nonce state. The HTTP workflow also runs `tests/dadyar-preview-subpath-http.test.cjs`, which serves the static preview at the exact `/dadyar-preview/` and `/dadyar-preview/index.html` paths and rejects traversal, encoded-path variants and non-GET methods. This is a local fixture, not a live-host check. It covers valid release, caller-ID spoofing, unauthenticated requests, foreign Origin, cross-site Fetch Metadata, raw request-target normalization aliases, method/path restrictions, content type, compression, body-size limits, a stalled chunked-body timeout, malformed JSON, unexpected request fields, rejection, replay and error redaction.

Passing these tests verifies the adapter contract only. It does not authenticate a real person, prove cPanel compatibility, restore a backup, validate a hosting destination, or authorize publication.
