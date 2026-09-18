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
| P0 transaction boundary | PARTIAL | Core negative paths pass; two proofs remain unavailable below |
| Production first run | PASS | `npm run test:production-first-run-closure` |
| Commercial operational E2E | PASS | `npm run test:commercial-e2e` |
| Real exports | PASS | `npm run test:real-exports` |
| Backup/restore and tamper rejection | PASS | `npm run test:backup-restore` |
| Browser acceptance | PASS | `npm run test:first-run-browser`, `npm run test:browser-acceptance` |
| Deep-link reload persistence | UNVERIFIED | URL-backed state is implemented; fresh onboarding fixture still requires a dedicated completed-onboarding reload fixture |
| Dependency security | PASS | `npm audit --audit-level=high` reports 0 vulnerabilities |
| Deployment CI execution | UNVERIFIED | Workflow is committed; target GitHub execution is not evidenced in this audit |

## Important current audit observations

These remain open until proven closed with runtime evidence:

- Reconciliation and external WPS, bank-feed, and statutory-provider sources
  must never be represented as successful without real provider evidence.
- The transaction-boundary suite reports that concurrent duplicate proof
  requires a shared durable uniqueness boundary.
- The transaction-boundary suite reports that cross-domain manufacturing
  failure injection requires a real transaction context.
- Direct browser reload persistence for a module deep link needs a stable
  completed-onboarding fixture.

## Fresh re-audit result

The final local re-audit passed the available repository gates:

```text
npm run lint
npm test
npm run test:p0-controls
npm run test:p0-boundary
npm run test:backup-restore
npm run test:final-full-system-certification
npm audit --audit-level=high
```

Negative paths were observed for unauthenticated access, cross-company scope,
closed-period posting, unbalanced journals, negative stock, tampered restore
payloads, and unauthorized payroll/commission actions. Browser startup and
full-system certification passed after process-group cleanup was added to the
browser fixture.

## Final status

The repository is **not marked `PRODUCTION CLOSED`**. The two unavailable P0
proofs, direct deep-link reload evidence, deployment-side CI execution, and
target-environment operational sign-off remain outstanding.

## Final deliverables

- Working code
- Automated tests
- Machine-readable evidence
- Updated certification/closure report
- Explicit remaining external dependencies
- Explicit remaining gaps
