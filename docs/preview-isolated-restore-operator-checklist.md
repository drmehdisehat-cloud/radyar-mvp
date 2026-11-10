# Dadyar preview: isolated backup restore and destination verification

**Status: NOT_READY until real evidence is collected.** A backup marked Complete or sized 140.38 MB is not proof of recoverability. This procedure does not authorize changes to production, main, DNS or the production database.

## Independent restore gate (operator in authenticated cPanel/hosting session)

1. Record backup identifier, creation timestamp, size in bytes, and SHA-256 of the **actual downloaded archive**. Never commit the archive, credentials, logs containing client data, or secrets.
2. Prepare an isolated, access-restricted restore target **outside the production document root**, with a separate database and database user if the backup includes a database. Verify available disk space and ensure no production hostnames or outbound integrations can be reached.
3. Restore the archive into that target using the hosting provider's supported restore mechanism. Do **not** point the restore at production or overwrite production files. If the hosting interface offers only in-place restore, stop and arrange an isolated hosting account or sandbox first.
4. Record the restore command/tool version, exit status, timestamp, target directory, file count, and a redacted error summary. Confirm representative restored files can be read and, when relevant, the isolated database opens. A copied archive or a same-inode hard link is not a restore.
5. Validate archive and restored-marker hashes with `scripts/check-isolated-restore-evidence.cjs`. Its output deliberately has `restore_proven:false`: it checks archive/file integrity only and cannot establish that a restore operation actually ran.

## Independent operator attestation (prepare outside Git)

Only after the restore operation and a separate review, prepare a local JSON evidence record for `scripts/decide-preview-release.cjs`. Do not commit the record or upload raw hosting logs. Required fields:

- `evidence: "independent-restore-manifest-v1"` and literal `restore_proven: true`.
- Non-empty SHA-256 values: `archive_sha256`, `restored_marker_sha256`, `restore_log_sha256`, and `database_probe_sha256`.
- `restore_exit_code: 0`, `restore_target_isolated: true`, `production_database_untouched: true`, `database_probe_passed: true`, `outbound_integrations_disabled: true`, and `reviewer_attested: true`.
- A distinct `restore_target_id`; `restore_target_path` outside `production_document_root`; separate `restore_database_name` / `restore_database_user` from the production database and user.
- Different non-empty `restore_operator` and `independent_reviewer` values.
- Valid UTC timestamps `restore_completed_at` and `reviewed_at`, with review no earlier than restore completion.

**Important:** this is a schema and consistency check, not a cryptographic signature or independent proof by itself. The reviewer must inspect the actual cPanel/hosting restore record, isolated database probe, and target paths. A synthetic manifest is never release evidence. Even a complete record only yields `READY_FOR_OWNER_DEPLOYMENT_APPROVAL`; it never deploys automatically.

## Preview artifact gate

1. Pin the exact reviewed commit SHA and `dadyar-preview/index.html` blob SHA. Build/prepare only that reviewed static preview; no API or authentication secrets.
2. Copy the reviewed file to a distinct, non-public temporary destination outside the production document root until owner approval.
3. Obtain the exact Git blob SHA-1 for `dadyar-preview/index.html` from the pinned reviewed commit (the SHA returned by GitHub's Contents API for that path/ref). Run `scripts/verify-preview-destination.cjs SOURCE/index.html STAGING_DESTINATION/index.html PRODUCTION_DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1`. The verifier recomputes the Git blob SHA-1 from the source bytes and rejects any source that is not the reviewed blob. It then requires an absolute, existing production document root, rejects symlinks in the root and destination ancestry, and refuses any destination inside that protected root. It also rejects hard links, requires the source Git blob SHA-1 to equal the reviewed commit's pinned blob SHA-1, and requires an exact SHA-256 match between source and destination. The resulting evidence includes both `source_blob_sha1` and `expected_source_blob_sha1`; the release decision rejects missing, malformed, zero, or mismatched pins.
4. Run the real Chromium mobile test and record that the preview made zero network/API requests and only allows report export after the explicit human-review acknowledgement. The verifier proves only a safe staged copy; it does not prove that a public deployment occurred or validate a live URL.

Do not publish to `/dadyar-preview/` until the independent restore, destination, browser, zero-network, human-review, legal-source, security, and owner-approval gates are all satisfied. Never change `main`, DNS, production files, or the production database as part of this preview procedure.


## Final public subpath verification (after every gate and owner approval)

The temporary staging copy above remains outside the production document root. The requested public URL `/dadyar-preview/` is a separate, post-approval step because its file necessarily lives inside the site's document root.

1. Do not create the public folder until the real isolated restore, independent review, mobile/zero-network checks, legal/security review, and owner approval have all passed.
2. Add only a new `dadyar-preview` directory directly under the existing document root and place the reviewed `index.html` inside it. Do not replace, edit, or delete any existing site file; do not add `.htaccess`, redirects, symlinks, scripts, uploads, or other files to that directory.
3. From a trusted working copy outside the document root, run `scripts/verify-public-preview-subpath.cjs SOURCE/index.html DOCUMENT_ROOT/dadyar-preview/index.html DOCUMENT_ROOT EXPECTED_SOURCE_GIT_BLOB_SHA1`. This is read-only. It requires the exact dedicated path, rejects symlink/hard-link aliases, rejects any extra directory entry (including `.htaccess`), pins the source Git blob SHA-1, and compares source/destination SHA-256.
4. Only after that verifier passes, request `https://mehdisehat.ir/dadyar-preview/` from an external browser and repeat the mobile, human-review export, and zero-network checks against the live URL. The filesystem verifier alone does not prove HTTP availability or safe hosting headers.

If the owner cannot provide an isolated cPanel/hosting restore target, separate database/user, and independent reviewer, stop before creating the public directory. The public-subpath verifier is not a substitute for backup recovery or authorization.
