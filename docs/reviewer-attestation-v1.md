# Dadyar human-review attestation v1

## Purpose

This module verifies a detached Ed25519 signature over a canonical review record. The record binds one approval to all of:

- the exact 40-character source commit;
- the SHA-256 of the preview artifact;
- the SHA-256 of the reviewed report;
- an opaque reviewer principal identifier;
- a policy identifier, key identifier, UTC review time and random nonce.

The verifier rejects rejected reviews, stale/future timestamps, unknown keys, altered bindings, malformed fields and invalid signatures. It does not contact a network service.

## Important trust boundary

This is a server-side verification primitive and contract test only. It is **not wired to the browser preview, server routes, cPanel, a reviewer identity provider or a production key registry**. The current preview's checkbox/name flow remains a local demonstration with no identity authentication.

A valid signature proves possession of the private key corresponding to a trusted public key. It does not, by itself, prove a person's legal qualification, employment, bar membership or authority. Before any real use:

1. Provision a reviewer identity through an approved identity-verification process.
2. Bind the resulting opaque principal ID to a separately controlled Ed25519 public key.
3. Pin the trusted public key through an independently approved configuration channel.
4. Define key rotation, revocation, custody, incident response and audit retention.
5. Require a separate reviewer, not the author or deployer, to sign the exact commit, artifact hash and report hash.
6. Integrate verification on a server-side release boundary only after security and privacy review.

The verifier also requires an asynchronous nonce store. Its `consume(nonce, expiresAt)` operation must atomically insert the nonce under a durable unique constraint and return `true` only for the first successful insertion. A missing store, duplicate nonce or failed store operation blocks verification. The test suite uses an in-memory Set only to simulate this contract; it is not suitable for production or multi-instance deployment.

The test suite creates ephemeral synthetic keys in memory. No private key, real identity, client information or secret is stored in this repository.

## Payload contract

Schema: `dadyar-human-review-attestation-v1`

Policy: `dadyar-preview-human-review-v1`

Signature input is UTF-8 JSON with the fixed field order defined in `scripts/reviewer-attestation.cjs`. Signature is Ed25519, base64url-encoded without padding. Nonce is 16 random bytes, base64url-encoded.

The verifier requires the caller to provide the expected commit, artifact hash, report hash and reviewer principal. It fails closed if any binding is absent or differs. It consumes the nonce only after the signature and all bindings pass, preventing replay when backed by a correctly implemented durable store.

## Release status

This primitive does not satisfy the isolated-backup-restore gate, destination-file validation, reviewer identity provisioning, independent security review or owner authorization. Do not merge, deploy or enable public API based on these tests alone.
