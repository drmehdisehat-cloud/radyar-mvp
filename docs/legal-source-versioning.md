# Versioned legal-source registry

**Current status: research infrastructure only.** The selector is not connected to the public chat, the local preview, or any answer-generation endpoint. It selects source metadata for a requested event date; it does not interpret legal text or authorize a legal conclusion.

## Version-selection rule

Use `backend/legal-source-versioning.cjs` to resolve a record by:

- topic and stable instrument ID;
- instrument type (`law` or `ruling`);
- event date;
- the date on which the system is allowed to know/rely on the record (`asOfDate`).

A selectable record must have all of the following:

1. A direct HTTPS document URL on the explicit official-host allowlist, not a portal homepage.
2. A document ID that exactly matches one canonical selector. For Qavanin, the path must be exactly `/Law/TreeText/` and the entire query string must be exactly `?IDS=<documentId>`; metadata, redirect, path aliases, extra parameters, fragments and trailing query delimiters are rejected. Other allowlisted portals must place the ID in exactly one path segment and have no query string until a portal-specific URL pattern is independently reviewed.
3. Publication date, effective-from date, optional exclusive effective-to date, and retrieval date.
4. SHA-256 of the exact retrieved legal text.
5. A non-placeholder human reviewer, an approved decision, a review date, and a reviewed-text SHA-256 equal to the stored text SHA-256.
6. Explicit `status: "verified"` and `releaseSourceEligible: true`.

The effective interval is `[effectiveFrom, effectiveTo)`. If two verified versions cover the same event date, resolution fails as `ambiguous_version`. If no eligible version covers the date, it returns `source_unavailable`; it never silently chooses the newest record.

The resolver returns the selected citation metadata only and always sets `legalConclusionPermitted: false`. A separate, reviewed answer-generation gate is required before any legal conclusion can be exposed.

## Current cheque-law record

See [legal-source-registry-check.json](legal-source-registry-check.json).

The official Qavanin consolidated-text candidate is recorded at:

- [Qavanin law text candidate](https://qavanin.ir/Law/TreeText/?IDS=11400475274213876131)
- [Qavanin original-law metadata page](https://qavanin.ir/Law/Attribute/?IDS=11400475274213876131)

The metadata page was observed again on 2026-11-10, but the consolidated-text page timed out on that recheck. Amendment publication/effective dates, the exact version effective on a particular event date, a text hash, and qualified human legal review remain missing. Therefore the record remains `research-only`, has no selectable effective interval, and cannot support an answer.

## Tests

`tests/legal-source-versioning.test.cjs` uses synthetic statute records only. It covers amendment boundaries, event-date selection, missing and research-only sources, URL/document-ID binding, hash-to-review binding, future observations, overlapping versions, duplicate IDs, and rejected human review.

Do not copy real client facts, raw legal documents, private hosting evidence, credentials, or API keys into the registry or tests. Keep source text in a controlled evidence store; commit only approved public metadata and hashes after independent review.


## ترتیب زمانی شواهد

برای هر نسخه‌ای که قرار است به‌عنوان منبع بررسی‌شده انتخاب شود، تاریخ انتشار رسمی نباید بعد از تاریخ دریافت متن باشد (`publicationDate <= retrievedAt`). تاریخ بازبینی نیز نباید پیش از دریافت همان نسخه باشد (`reviewedAt >= retrievedAt`). تاریخ اثر (`effectiveFrom`) جداگانه نگهداری می‌شود و ممکن است طبق حکم صریح سند با تاریخ انتشار یکسان نباشد؛ این کنترل صرفاً ترتیب زمانی مشاهده و بازبینی را می‌سنجد و درباره اثر عطف‌به‌ماسبق نتیجه‌گیری نمی‌کند.

