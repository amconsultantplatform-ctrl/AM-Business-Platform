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
| P0 transaction boundary | PASS | `npm run test:p0-boundary` uses eight independent worker processes against one SQLite database and proves one durable financial event, journal, inventory mutation, retry identity, restart persistence, and rollback across manufacturing, inventory, WIP, GL, and audit. |
| Reconciliation runtime | PASS | `npm run test:product-reconciliation` proves module-specific opening at period start, strict tenant/company/date scope, current-period movements, next-period exclusion, and explicit missing-source states. |
| Production first run | PASS | `npm run test:production-first-run-closure` runs with demo flags disabled and real SQLite persistence. |
| Commercial operational E2E | PASS | `npm run test:commercial-e2e` |
| Real exports | PASS | `npm run test:real-exports` |
| Backup/restore and tamper rejection | PASS | `npm run test:backup-restore` |
| Browser acceptance | PASS | `npm run test:first-run-browser`, `npm run test:browser-acceptance` |
| Deep-link reload persistence | PASS | `npm run test:deep-link-reload-browser` verifies runtime `/auth/me` tenant/company context before and after hard refresh, plus session and module persistence. |
| Production-equivalent runtime | PASS | `npm run test:production-equivalent-certification` asserts production environment flags, real SQLite/HTTP/auth, invalid posting rejection, canonical GL effects, and restart persistence. |
| Dependency security | PASS | `npm audit --audit-level=high` previously reported 0 vulnerabilities. |
| Deployment CI execution | PASS | GitHub `Production Certification` and `Production Closure Gate` both passed for current HEAD `6c367446ed6d0e23d2335d5b77ca1a07f26d34e0`. |

## Open limitations

External WPS, bank-feed, statutory-provider evidence, and target-environment
operational sign-off remain external requirements and must not be represented
as repository PASS without external evidence.

## Fresh re-audit result

The targeted blocker proofs passed. The one requested local Final Gate was
attempted once on the latest change set but returned `FINAL_GATE_FAILURES=5`
because local TypeScript/build/export/browser processes were terminated or
encountered a browser server port collision. GitHub's current-HEAD
Certification and Closure Gate both passed independently.

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
