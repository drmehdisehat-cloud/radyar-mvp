# Dadyar preview: isolated backup restore and destination verification

**Status: NOT_READY until real evidence is collected.** A backup marked Complete or sized 140.38 MB is not proof of recoverability. This procedure does not authorize changes to production, main, DNS or the production database.

## Independent restore gate (operator in authenticated cPanel/hosting session)

1. Record backup identifier, creation timestamp, size in bytes, and SHA-256 of the **actual downloaded archive**. Never commit the archive, credentials, logs containing client data, or secrets.
2. Prepare an isolated, access-restricted restore target **outside the production document root**, with a separate database and database user if the backup includes a database. Keep the downloaded archive itself outside the production document root too. The evidence checker requires both absolute paths and rejects either one if it resolves inside the live web root. Verify available disk space and ensure no production hostnames or outbound integrations can be reached.
3. Restore the archive into that target using the hosting provider's supported restore mechanism. Do **not** point the restore at production or overwrite production files. If the hosting interface offers only in-place restore, stop and arrange an isolated hosting account or sandbox first.
4. Record the restore command/tool version, exit status, timestamp, target directory, file count, and a redacted error summary. Confirm representative restored files can be read and, when relevant, the isolated database opens. A copied archive or a same-inode hard link is not a restore. Both the downloaded archive and selected restored marker must be regular files with exactly one hard link (`nlink=1`); any extra alias, including one outside the restore tree, is rejected. Choose a standalone marker such as the restored preview `index.html`. The checker opens both files with `O_NOFOLLOW`, hashes through the open descriptors, and compares inode, size, link count, mode, modification time and change time before/after reading. It rejects a path that resolves through a symlink alias or changes during the read. These checks strengthen file integrity but do not prove that cPanel performed a restore.
5. Validate archive and restored-marker hashes and both path boundaries with `scripts/check-isolated-restore-evidence.cjs ARCHIVE RESTORED_ROOT PRODUCTION_DOCUMENT_ROOT RELATIVE_MARKER EXPECTED_ARCHIVE_SHA256 EXPECTED_MARKER_SHA256`. Its output deliberately has `restore_proven:false`: it checks archive/file integrity only and cannot establish that a restore operation actually ran. The preview destination checker also uses the same stable descriptor reader when comparing the staged file with the pinned Git blob and SHA-256; a matching hash does not authorize copying into the live document root.

## Independent operator attestation (prepare outside Git)

Only after the restore operation and a separate review, prepare a local JSON evidence record matching `independent-restore-manifest-v1`. Do not commit the record or upload raw hosting logs. Required fields:

- `evidence: "independent-restore-manifest-v1"` and literal `restore_proven: true`.
- Non-empty SHA-256 values: `archive_sha256`, `restored_marker_sha256`, `restore_log_sha256`, and `database_probe_sha256`.
- `restore_exit_code: 0`, `restore_target_isolated: true`, `production_database_untouched: true`, `database_probe_passed: true`, `outbound_integrations_disabled: true`, and `reviewer_attested: true`.
- A distinct `restore_target_id`; `restore_target_path` must exactly equal the canonical absolute `restore_target_realpath`, and `production_document_root` must exactly equal the canonical absolute `production_document_root_realpath`. Both pairs must be captured from the actual resolved paths (for example, `realpath` / `pwd -P`), and the resolved restore target must be outside the resolved production document root. Do not substitute a symlink alias or a merely lexical path. The local integrity checker emits `restored_root_realpath` and `production_document_root_realpath`; transfer those observed values into the attestation only after the independent operator confirms them against the hosting environment. Keep separate `restore_database_name` / `restore_database_user` from the production database and user.
- Different non-empty `restore_operator` and `independent_reviewer` values.
- Valid UTC timestamps `restore_completed_at` and `reviewed_at`, with review no earlier than restore completion.

**Important:** this is a schema and consistency check, not a cryptographic signature or independent proof by itself. The canonical realpath fields close a lexical-path/symlink-alias gap, but they remain operator-supplied observations. The reviewer must inspect the actual cPanel/hosting restore record, isolated database probe, and resolved target paths. A synthetic manifest is never release evidence.

## Read-only release preflight CLI

After collecting the real restore manifest and destination-verifier output, place both JSON files in a secure local directory **outside the Git checkout**. Each file must be an absolute-path, regular, non-symlink JSON file no larger than 64 KiB. Never put client records, credentials, API keys, raw hosting logs or the backup archive in these files.

Run from a trusted checkout:

```sh
node scripts/preview-release-preflight.cjs --restore-evidence /secure/local/restore-manifest.json --restore-operator-public-key /secure/local/operator-public.pem --restore-operator-signature /secure/local/operator.sig --restore-reviewer-public-key /secure/local/reviewer-public.pem --restore-reviewer-signature /secure/local/reviewer.sig --expected-restore-operator-public-key-sha256 64_HEX --expected-restore-reviewer-public-key-sha256 64_HEX --destination-evidence /secure/local/destination-evidence.json --review-attestation /secure/local/review-attestation.json --review-trust-store /secure/local/review-trust-store.json --expected-source-commit 40_HEX --expected-artifact-sha256 64_HEX --expected-review-trust-store-sha256 64_HEX --isolated-restore-verified --mobile-browser-verified --zero-api-requests-verified --human-review-verified
```

The four boolean switches are explicit operator/reviewer attestations, not independently measured facts. The restore manifest must now pass two distinct Ed25519 signatures and match both public-key SHA-256 fingerprints supplied through a separate owner-approved channel. The signed human review is checked against its supplied trust store and bound to the exact source commit, exact `dadyar-preview/index.html` Git blob SHA-1, and artifact SHA-256. The CLI also requires `--expected-review-trust-store-sha256`, computed from the exact trust-store file bytes and pinned through a separate owner-approved channel; a changed or substituted trust store is rejected. This pin proves byte identity only. The owner must still verify the pinned digest, real-world reviewer identity, issuer, and key ownership through an independent trusted channel. Do not pass the removed `--authenticated-human-review-attested` boolean option: the current CLI rejects it because a bare assertion cannot authenticate a reviewer.

The CLI checks evidence-file shape, consistency, stable file reads, both restore-manifest signatures, the two supplied restore-key fingerprints, the pinned review trust-store digest, and the human-review signature; it performs no network request, file copy, publication or deployment. These cryptographic checks establish integrity against supplied pins only, not real-world identity or proof that the hosting restore operation actually occurred. Evidence, attestation and trust-store files must be absolute-path regular files outside the Git checkout, without symlink or hard-link aliases, and no larger than 64 KiB. Never place client records, credentials, API keys, raw hosting logs or the backup archive in these JSON files. Exit code 1 means structural release blockers remain; exit code 2 means invalid invocation or evidence input; exit code 3 means the evidence JSON shape is internally consistent but independent authenticity checks, live-host verification, legal/security review and owner approval remain outstanding. The tool never emits a release-ready or deployment-authorized status.

## Preview artifact gate

1. Pin the exact reviewed commit SHA and `dadyar-preview/index.html` blob SHA. Build/prepare only that reviewed static preview; no API or authentication secrets.
2. Copy the reviewed file to a distinct, non-public temporary destination outside both the production document root and the Git checkout until owner approval. Keeping the copy inside the checkout is rejected so it cannot be mistaken for an independently staged hosting destination.
3. Obtain the exact Git blob SHA-1 for `dadyar-preview/index.html` from the pinned reviewed commit (the SHA returned by GitHub's Contents API for that path/ref). Run `scripts/verify-preview-destination.cjs SOURCE/index.html STAGING_DESTINATION/index.html PRODUCTION_DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1`. All three filesystem path arguments must be absolute canonical paths; relative source or destination arguments and an all-zero placeholder Git blob pin are rejected. The destination must also resolve outside the trusted checkout as well as outside the production document root. The verifier recomputes the Git blob SHA-1 from the source bytes and rejects any source that is not the reviewed blob. It then requires an absolute, existing production document root, rejects symlinks in the root and destination ancestry, and refuses any destination inside that protected root. It rejects a destination that is a hard link to the source and requires the destination inode to have `nlink=1`, so an additional hard-link alias to an unrelated file outside the dedicated directory is rejected too. It also requires the source Git blob SHA-1 to equal the reviewed commit's pinned blob SHA-1 and an exact SHA-256 match between source and destination. The resulting evidence includes `source_blob_sha1`, `expected_source_blob_sha1`, `git_checkout_realpath`, and `destination_outside_git_checkout`; the release decision rejects missing, malformed, zero, or mismatched pins and refuses legacy destination evidence that does not prove separation from the checkout.
4. Run the real Chromium mobile test and record that the preview made zero network/API requests and only allows report export after the explicit human-review acknowledgement. The verifier proves only a safe staged copy; it does not prove that a public deployment occurred or validate a live URL.

Do not publish to `/dadyar-preview/` until the independent restore, destination, browser, zero-network, human-review, legal-source, security, and owner-approval gates are all satisfied. Never change `main`, DNS, production files, or the production database as part of this preview procedure.

## Final public subpath verification (after every gate and owner approval)

The temporary staging copy above remains outside the production document root. The requested public URL `/dadyar-preview/` is a separate, post-approval step because its file necessarily lives inside the site's document root.

1. Do not create the public folder until the real isolated restore, independent review, mobile/zero-network checks, legal/security review, and owner approval have all passed.
2. Add only a new `dadyar-preview` directory directly under the existing document root and place the reviewed `index.html` inside it. Do not replace, edit, or delete any existing site file; do not add `.htaccess`, redirects, symlinks, scripts, uploads, or other files to that directory.
3. From a trusted working copy outside the document root, run `scripts/verify-public-preview-subpath.cjs SOURCE/index.html DOCUMENT_ROOT/dadyar-preview/index.html DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1`. This is read-only. It requires the exact dedicated path, rejects symlink/hard-link aliases, rejects any extra directory entry (including `.htaccess`), pins the source Git blob SHA-1, and compares source/destination SHA-256.
4. Only after that verifier passes, request `https://mehdisehat.ir/dadyar-preview/` from an external browser and repeat the mobile, human-review export, and zero-network checks against the live URL. The filesystem verifier alone does not prove HTTP availability or safe hosting headers.

If the owner cannot provide an isolated cPanel/hosting restore target, separate database/user, and independent reviewer, stop before creating the public directory. The public-subpath verifier is not a substitute for backup recovery or authorization.


The release decision engine now requires `restore_target_path === restore_target_realpath` and `production_document_root === production_document_root_realpath`, with both pairs canonical and absolute. If a path resolves differently (including through a symlinked parent), correct the isolated target/path evidence and repeat the independent review; do not weaken this gate.

## Live HTTPS verification of the dedicated preview URL

Run this only **after** the independent restore evidence and destination-file checks above have passed and the owner has explicitly approved placing the reviewed static file in the dedicated `dadyar-preview` directory. This command performs one read-only HTTPS GET; it does not upload, change DNS, follow redirects, send credentials, or deploy anything.

```sh
node scripts/verify-public-preview-http.cjs \
  https://mehdisehat.ir/dadyar-preview/ \
  EXPECTED_SOURCE_SHA256 \
  EXPECTED_SOURCE_GIT_BLOB_SHA1
```

Use the SHA-256 and Git blob SHA-1 from the exact reviewed source file, not values copied from an earlier build. A successful result must report HTTP 200, matching hashes, HTML content type, `Cache-Control: no-store`, `nosniff`, `X-Frame-Options: DENY`, a response-header CSP containing `frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, a restrictive meta/HTTP CSP, `Permissions-Policy` disabling camera/microphone/geolocation, `noindex/nofollow`, `no-referrer`, and no cookies. The meta CSP alone cannot enforce `frame-ancestors`; the hosting layer must send that directive as an HTTP response header. Any redirect, changed body, missing security property, timeout, or TLS/DNS failure is `NOT_VERIFIED`. This live probe is operational evidence only; it does not replace the independent backup restore, authenticated human review, legal/security sign-off, or explicit owner release approval.
The dedicated public directory is required to contain only `index.html`; do not add an `.htaccess` file there. Configure the required response headers at the hosting/vhost level (or have IranHost configure them) before the live probe: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Content-Security-Policy` including `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. If any required header cannot be supplied without adding files to the preview directory, keep the release blocked and ask the host to provide it at a parent/server level.


## Two-party cryptographic seal for the restore manifest (integrity only)

The manifest can be signed by two different Ed25519 keypairs: the restore operator and the independent reviewer. This makes later changes to the manifest detectable. It does **not** prove that a restore actually happened, establish the signers' real-world identities, or authorize deployment. The verifier deliberately reports `restore_operation_independently_verified: false` and `deployment_authorized: false`.

Keep both private keys, the manifest, canonical payload, signatures, and raw hosting logs outside Git and outside the public document root. Never send private keys to ChatGPT or commit them. The owner must verify the two public-key SHA-256 fingerprints through a separate trusted channel before treating either key as belonging to the named person; the tool currently reports key fingerprints but does not pin them to an owner-approved trust store.

Generate separate keys on the operator's and reviewer's own trusted machines:

```sh
openssl genpkey -algorithm ED25519 -out operator-private.pem
openssl pkey -in operator-private.pem -pubout -out operator-public.pem
# The independent reviewer generates a separate reviewer-private.pem / reviewer-public.pem pair.
```

After the real restore and independent inspection, create the manifest outside the checkout using the schema above. Canonicalize it, then have each signer sign the exact same canonical bytes with their own private key:

```sh
node scripts/verify-restore-attestation-signatures.cjs \
  --canonicalize --manifest /secure/local/restore-manifest.json \
  > /secure/local/restore-manifest.canonical.json

openssl pkeyutl -sign -rawin -inkey /secure/local/operator-private.pem \
  -in /secure/local/restore-manifest.canonical.json \
  -out /secure/local/operator.sig

openssl pkeyutl -sign -rawin -inkey /secure/local/reviewer-private.pem \
  -in /secure/local/restore-manifest.canonical.json \
  -out /secure/local/reviewer.sig

node scripts/verify-restore-attestation-signatures.cjs \
  --manifest /secure/local/restore-manifest.json \
  --operator-public-key /secure/local/operator-public.pem \
  --operator-signature /secure/local/operator.sig \
  --reviewer-public-key /secure/local/reviewer-public.pem \
  --reviewer-signature /secure/local/reviewer.sig
```

The signature files are raw 64-byte Ed25519 signatures. The verifier rejects identical public keys, malformed signatures, a modified manifest, incomplete restore fields, symlinked evidence paths, and evidence files inside the Git checkout. Its `SIGNATURES_VERIFIED_UNTRUSTED_KEY_IDENTITY` status means only that both supplied keys verify the same canonical manifest. The owner must separately authenticate the public-key fingerprints and the reviewer must inspect the actual isolated restore log and database probe. Even after signature verification, keep the release blocked until the real restore, destination, mobile/zero-network, legal/security, and owner-approval gates pass.
