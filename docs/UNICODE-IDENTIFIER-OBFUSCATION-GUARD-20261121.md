# Preview privacy guard: Unicode invisible-character obfuscation

Observed: the offline preview's sensitive-identifier normalizer removed several bidi and zero-width characters, but did not cover every Unicode Default_Ignorable_Code_Point. A synthetic phone, national-ID, card-number, or IBAN-like digit sequence could therefore be split with an invisible operator before the existing digit-compaction check.

Change on the experimental branch:
- Normalize the free-text/reviewer string with NFKC.
- Remove Unicode Default_Ignorable_Code_Point characters before digit and identifier matching.
- Apply email, domain, and address-pattern checks to the same normalized text.
- Keep the original free question out of the report and keep all classification local.
- Update the inline script CSP SHA-256 to match the exact modified script bytes.

Regression coverage:
- Synthetic Persian-digit sequences split with U+2061, U+2062, U+2063, and U+2064 must be detected.
- A benign synthetic cheque/lease question must not be flagged.
- The preview's 27-domain routing, mobile review/export, CSP, and no-network checks remain in the CI suite.

This is a best-effort client-side privacy guard, not comprehensive PII detection, redaction, authentication, or a safe channel for real client data. Continue to use synthetic data only. No API, storage, deployment, DNS, production database, or main-branch changes are authorized by this patch.
