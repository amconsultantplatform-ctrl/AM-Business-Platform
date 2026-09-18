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
| P0 transaction boundary | PARTIAL | Test now uses SQLite persistence, but the concurrency proof reuses one DatabaseSync instance with synchronous transaction bodies; this does not prove an independent concurrent-writer race. Manufacturing rollback persists DB writes transactionally, but the ManufacturingInventoryContext mutation is in memory and is not itself transaction-coupled. |
| Reconciliation runtime | PARTIAL | Silent zero fallback was removed and missing-source PENDING behavior added, but one aggregate opening value is reused across modules; opening selection uses period <= requested period; undated/missing-scope records may be included; movements are not consistently derived from canonical subledger opening-to-closing semantics. |
| Production first run | PASS | `npm run test:production-first-run-closure` runs with demo flags disabled and real SQLite persistence. |
| Commercial operational E2E | PASS | `npm run test:commercial-e2e` |
| Real exports | PASS | `npm run test:real-exports` |
| Backup/restore and tamper rejection | PASS | `npm run test:backup-restore` |
| Browser acceptance | PASS | `npm run test:first-run-browser`, `npm run test:browser-acceptance` |
| Deep-link reload persistence | PARTIAL | URL/auth/module persistence is tested after completed onboarding, but active company/tenant context is not explicitly asserted before and after reload. |
| Production-equivalent runtime | PARTIAL | Current wrapper runs the production first-run closure with demo flags disabled; its evidence text is broader than the assertions actually implemented. |
| Dependency security | PASS | `npm audit --audit-level=high` previously reported 0 vulnerabilities. |
| Deployment CI execution | UNVERIFIED FOR CURRENT HEAD | Prior successful Actions evidence was tied to earlier commit `b4d9d865...`; current HEAD must have a verified successful run/check before claiming current-HEAD CI certification. |

## Open blockers

1. Prove true concurrent durable uniqueness with independent workers/processes or
   independent database connections against shared SQLite state, including
   duplicate prevention and retry idempotency.

2. Couple manufacturing/inventory/WIP/financial-event/audit state changes to one
   real transaction boundary, and prove rollback of both persisted state and
   domain state after injected failure.

3. Correct reconciliation accounting semantics:
   - opening balance at the start of the requested period, not cumulative
     `period <= requested period`;
   - strict tenant/company scope;
   - canonical period-scoped subledger movement;
   - module-specific opening/movement/closing calculations;
   - explicit missing/invalid source states.

4. Align production-equivalent certification claims with actual assertions and
   evidence.

5. Add explicit company/tenant context verification to completed-onboarding
   deep-link hard-refresh proof.

6. Verify GitHub Actions for the exact final HEAD after the fixes above.

External WPS, bank-feed, statutory-provider evidence, and target-environment
operational sign-off remain external requirements and must not be represented
as repository PASS without external evidence.

## Fresh re-audit result

Repository-level tests have demonstrated substantial progress, but the latest
source-level re-audit found the remaining proof/semantic gaps above. Therefore
the repository is not yet eligible for production closure.

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
