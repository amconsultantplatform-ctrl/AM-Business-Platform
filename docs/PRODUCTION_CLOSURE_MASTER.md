# ERP Production Closure — Master Control

Repository: `amconsultantplatform-ctrl/AM-Business-Platform`
Branch of record: `main`

## Operating rule

Never close a gate from documentation alone. Required lifecycle:

`Audit → Implement → Test → Inspect evidence → Re-audit → Close`

A gate is CLOSED only when implementation, negative paths, persistence,
authorization/scope, accounting effects, idempotency, audit trail, restart
behavior, and HTTP-level evidence agree.

## Closure sequence

Audit → P0 → P1 → P2 → fresh re-audit → final certification.

## Certification gate

The full gate is:

`lint → build → regression → P0 controls → P0 boundaries → reconciliation → invoice HTTP → commercial E2E → exports → first-run → fiscal close → accounting certification → full-system certification → localization/costing → browser acceptance → security audit → diff check`

The GitHub Actions workflow at
`.github/workflows/production-closure-gate.yml` is the repository's existing
production gate; the supplemental workflow
`.github/workflows/production-certification.yml` covers the Issue #1 commands.

## Current evidence after re-audit

| Gate | Status | Evidence / audit finding |
|---|---|---|
| Type safety | PASS | `npm run lint` |
| Core phase regression | PASS | `npm test` |
| P0 route controls | PASS | `npm run test:p0-controls` |
| P0 transaction boundary | PASS | `npm run test:p0-boundary` uses eight independent worker processes against one SQLite database, claims one durable business key, proves exactly one accepted execution and one financial event, journal, inventory mutation, and audit event, then proves restart persistence, automatic SQLite rollback, and a successful retry without duplicate effects across manufacturing, inventory, WIP, GL, and audit. |
| Reconciliation runtime | PASS | `npm run test:product-reconciliation` proves module-specific opening at period start, strict tenant/company/date scope, current-period movements, next-period exclusion, explicit module-tagged canonical movements, closing = opening + movements + adjustments, GL difference detection, and explicit missing-source states. |
| Production first run | PASS | `npm run test:production-first-run-closure` runs with demo flags disabled and real SQLite persistence. |
| Commercial operational E2E | PASS | `npm run test:commercial-e2e` |
| Real exports | PASS | `npm run test:real-exports` uses an isolated database, dynamically allocated port, detached process group, and awaited cleanup; real PDF/XLSX content is parsed and verified. |
| Backup/restore and tamper rejection | PASS | `npm run test:backup-restore` |
| Browser acceptance | PASS | `npm run test:first-run-browser`, `npm run test:browser-acceptance` |
| Deep-link reload persistence | PASS | `npm run test:deep-link-reload-browser` verifies completed onboarding, direct module URL, runtime authentication, tenant/company context before and after hard refresh, plus session and module persistence with isolated server cleanup. |
| Production-equivalent runtime | PASS | `npm run test:production-equivalent-certification` asserts production environment flags, real SQLite/HTTP/auth, invalid posting rejection, canonical GL effects, and restart persistence. |
| Dependency security | PASS | `npm audit --audit-level=high` previously reported 0 vulnerabilities. |
| Deployment CI execution | PENDING | Must be rechecked on the exact pushed SHA after these changes; prior evidence for `021ac415e2d5a55a01a16f90b26acd542cf4d166` is stale. |

## Open limitations

External WPS, bank-feed, statutory-provider evidence, and target-environment
operational sign-off remain external requirements and must not be represented
as repository PASS without external evidence.

## Fresh re-audit result

The targeted blocker proofs passed. Build and typecheck now run with explicit
Node memory limits in `package.json`; isolated exports and browser suites use
dynamic ports, process-group cleanup, and isolated databases. The one required
local Final Gate has not been rerun yet, by instruction, until exact-SHA CI
evidence is available.

## Final status

**PRODUCTION CLOSED: NO**

Issue #2 must remain blocked until all P0 blockers above are proven and a final
fresh gate/re-audit agrees with the implementation.

## Final deliverables

- Working code
- Automated tests
- Machine-readable evidence
- Updated certification/closure report
- Explicit remaining external dependencies
- Explicit remaining gaps
