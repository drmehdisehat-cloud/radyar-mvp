# Dadyar preview: isolated backup restore and destination verification

**Status: NOT_READY until real evidence is collected.** A backup marked Complete or sized 140.38 MB is not proof of recoverability. This procedure does not authorize changes to production, main, DNS or the production database.

## Independent restore gate (operator in authenticated cPanel/hosting session)

1. Record backup identifier, creation timestamp, size in bytes, and SHA-256 of the **actual downloaded archive**. Never commit the archive, credentials, logs containing client data, or secrets.
2. Prepare an isolated, access-restricted restore target **outside the production document root**, with a separate database and database user if the backup includes a database. Verify available disk space and ensure no production hostnames or outbound integrations can be reached.
3. Restore the archive into that target using the hosting provider's supported restore mechanism. Do **not** point the restore at production or overwrite production files. If the hosting interface offers only in-place restore, stop and arrange an isolated hosting account or sandbox first.
4. Record the restore command/tool version, exit status, timestamp, target directory, file count, and a redacted error summary. Confirm representative restored files can be read and, when relevant, the isolated database opens. A copied archive or a same-inode hard link is not a restore.
5. Validate independent evidence with the existing `scripts/check-isolated-restore-evidence.cjs` according to its actual CLI contract; inspect its source and tests before invocation. Preserve a redacted evidence record. A synthetic test passing does not satisfy this step.

## Preview artifact gate

1. Pin the exact reviewed commit SHA and `dadyar-preview/index.html` blob SHA. Build/prepare only that reviewed static preview; no API or authentication secrets.
2. Run Node contract tests and the real Chromium browser test against the **same commit**. Confirm mobile viewport, export blocked until explicit review acknowledgement, and no API/network requests. A narrow desktop viewport alone is not device emulation.
3. Stage the reviewed HTML in a **separate non-public temporary directory**. Calculate SHA-256 for both source and staged destination and verify byte-for-byte match; check the destination and its parent paths are not symlinks. Use `scripts/verify-preview-destination.cjs` only after checking its CLI contract.
4. Collect redacted evidence: source SHA-256, destination SHA-256, target path, checks performed, operator/time, and exact CI run for the reviewed commit. Never publish a URL before testing the actual served response and the route `/dadyar-preview/`.
5. Only after independent restore evidence, destination integrity, real browser/no-network checks, human review and explicit owner publication authorization, consider deploying the static preview to `/dadyar-preview/`. Keep the main site, DNS, production DB and `main` unchanged. **Do not activate public AI/API.**

If an authenticated hosting session or isolated restore destination is unavailable, stop the hosting operation and continue repository-only checks. Never request passwords, OTPs or API keys in chat.
