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

## Current evidence

| Gate | Status | Evidence |
|---|---|---|
| Type safety | PASS | `npm run lint` |
| Core phase regression | PASS | `npm test` |
| P0 route controls | PASS | `npm run test:p0-controls` |
| P0 transaction boundary | PASS | `npm run test:p0-boundary` proves concurrent durable idempotency, restart persistence, and SQLite rollback across manufacturing, inventory, WIP financial event, and audit |
| Reconciliation runtime | PASS | `npm run test:product-reconciliation` proves tenant/company/period scope, persisted journal/opening sources, and explicit missing-source `PENDING` behavior |
| Production first run | PASS | `npm run test:production-first-run-closure` |
| Commercial operational E2E | PASS | `npm run test:commercial-e2e` |
| Real exports | PASS | `npm run test:real-exports` |
| Backup/restore and tamper rejection | PASS | `npm run test:backup-restore` |
| Browser acceptance | PASS | `npm run test:first-run-browser`, `npm run test:browser-acceptance` |
| Deep-link reload persistence | PASS | `npm run test:deep-link-reload-browser` completes onboarding, authenticates, opens `?module=accounting`, hard-refreshes, and verifies session/module/company context |
| Production-equivalent runtime | PASS | `npm run test:production-equivalent-certification` uses real SQLite, HTTP APIs, auth, canonical GL, and restart persistence with demo flags disabled |
| Dependency security | PASS | `npm audit --audit-level=high` reports 0 vulnerabilities |
| Deployment CI execution | PASS | GitHub `Production Certification` and `Production Closure Gate` passed for commit `b4d9d865682f87d7a699fbf2bb21115d57dad54f` |

## Important current audit observations

These remain open until proven closed with runtime evidence:

- Reconciliation and external WPS, bank-feed, and statutory-provider sources
  must never be represented as successful without real provider evidence.
- External WPS, bank-feed, and statutory-provider sources remain outside this
  repository and are not represented as successful without provider evidence.
- Target-environment operational sign-off remains an external deployment action.

## Fresh re-audit result

The final local re-audit passed the available repository gates:

```text
npm run lint
npm test
npm run test:p0-controls
npm run test:p0-boundary
npm run test:backup-restore
npm run test:deep-link-reload-browser
npm run test:production-equivalent-certification
npm run test:final-full-system-certification
npm audit --audit-level=high
```

Negative paths were observed for unauthenticated access, cross-company scope,
closed-period posting, unbalanced journals, negative stock, tampered restore
payloads, and unauthorized payroll/commission actions. Browser startup, completed-onboarding deep-link reload, production-equivalent
runtime certification, and full-system certification passed after process-group
cleanup and isolated browser ports were added to the fixtures.

## Final Gate evidence

The one requested Final Gate completed with `FINAL_GATE_FAILURES=0`.
`npm run lint`, build, regression, all listed P0/P1/P2 certification commands,
browser checks, backup/restore, dependency audit, and `git diff --check` all
passed. The final gate output included `FINAL RESULT: PASS` for accounting and
full-system certification.

## Final status

The repository is **not marked `PRODUCTION CLOSED`** until target-environment
operational sign-off and external provider evidence are completed.

## Final deliverables

- Working code
- Automated tests
- Machine-readable evidence
- Updated certification/closure report
- Explicit remaining external dependencies
- Explicit remaining gaps
