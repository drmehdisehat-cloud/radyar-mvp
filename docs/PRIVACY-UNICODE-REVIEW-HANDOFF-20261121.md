# Review-only CI handoff: Unicode identifier privacy guard

This branch is based on the current Dadyar experimental head and exists only to run the pull-request CI against the exact preview source after the Unicode privacy regression was added.

Review points:
- NFKC normalization is followed by removal of Unicode Default_Ignorable_Code_Point characters before sensitive-identifier matching.
- The free-text classifier remains local, multi-topic, and non-authoritative.
- Raw free text is cleared before report construction and is not exported or persisted.
- The preview CSP script hash was recomputed from the exact inline script and read back from GitHub.
- Synthetic regression probes cover invisible U+2061 through U+2064 inserted into Persian-digit identifiers.
- The existing Chromium/mobile tests still gate rejected review, approved local review, single-use export, pagehide clearing, no remote requests, and 320px/390px layout.

This is not an authentication change. Local review remains unauthenticated; no API or public AI is enabled. Keep this PR Draft. Do not merge or deploy based on CI alone. No production files, DNS, database, or main branch are changed.
