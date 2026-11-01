# Dadyar staging host readiness (decision record)

Status: **BLOCKED / no deployment approved**. This is an inspection checklist, not a staging installation guide. The existing `backend/server.js` is a **loopback-only, unauthenticated development API**; do not expose it through cPanel, a public subdomain, a tunnel, or a reverse proxy. The experimental `backend/preview-gate.js` is disconnected and is **not** production authentication.

## Evidence to collect in Iranhost / cPanel (without disclosing secrets)

1. Record hosting type (shared/VPS), Node.js 22 support, ability to run a persistent isolated process, and whether a private application listener is supported. Do not assume PHP hosting can execute this Node service.
2. Record whether a **separate** staging document root, database and database user, and access controls can be provisioned without changing the live site's DNS, document root, files or database.
3. Confirm an independently restorable **files + database** backup of the live site, including restoration procedure and date. Do not copy live client records into staging.
4. Check TLS certificate coverage and renewal for the proposed staging hostname, HTTPS-only access, and an access restriction that is enforced **before** any application content is served.
5. Record runtime and deployment logs retention, least-privilege filesystem permissions, update/rollback path, and where secrets are stored outside source control.
6. Confirm the repository visibility and audit reachable Git history for accidentally committed credentials or client data **before** connecting hosting credentials. Public GitHub repository visibility does not by itself prove a leak.

## Release decision

- **NO-GO** if the host cannot provide an isolated runtime, staging access restriction, TLS, independent storage, and rollback.
- **NO-GO** if application-level identity/session authorization, abuse protection, privacy/retention rules, security review, or dated official legal-source review is missing, even when the CI is green.
- If shared hosting cannot meet these requirements, evaluate a separate private staging service; do **not** weaken the development API's loopback or NODE_ENV safeguards to make it run on a public host.
- Any change to `main`, live DNS, live hosting configuration or live databases requires the owner's explicit approval and a verified backup first.

## Verification evidence to attach later

Host inspection date: **not yet verified**. Backup restore test: **not yet verified**. Staging URL: **none**. Security sign-off: **none**. Legal sign-off: **none**. Owner deployment approval: **none**.
