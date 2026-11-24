# Persian-calendar event-date versioning

The base \`backend/legal-source-versioning.cjs\` resolver accepts Gregorian \`YYYY-MM-DD\` dates only. Iranian statutes, Gazette metadata, and user-reported event dates are commonly expressed in the Solar Hijri (Jalali) calendar. Passing a Jalali string such as \`1403-07-01\` directly to the Gregorian resolver would silently interpret it as a year in the Gregorian calendar. Do not do that.

Use \`backend/persian-legal-date-versioning.cjs\` for Persian legal-event selection. It requires an explicit \`eventDateCalendar\` (\`jalali\` or \`gregorian\`), an explicit \`asOfDateCalendar: "gregorian"\`, and an explicit \`legalDateCalendar\` on every verified record. \`publicationDate\`, \`effectiveFrom\`, and \`effectiveTo\` are converted to Gregorian UTC civil dates before selection; \`retrievedAt\`, \`reviewedAt\`, and \`asOfDate\` remain Gregorian system dates. The result preserves the original legal dates and records the normalized Gregorian dates used for interval comparison.

The adapter uses the Node runtime's ICU Persian calendar through \`Intl.DateTimeFormat\` and performs an exact day-level search. If Persian calendar support is unavailable or a Jalali date is invalid (including leap-day validation), conversion fails closed. The resolver remains provenance-only and always returns \`legalConclusionPermitted: false\`.

Tests use synthetic statutes only. No real client data or legal-source text is included. Before connecting this adapter to question intake, the product must define the user-facing event-date format and validate the deployed Node/ICU runtime in isolated staging.
