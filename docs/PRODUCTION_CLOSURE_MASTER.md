# ERP Production Closure — Master Control

Repository: `amconsultantplatform-ctrl/AM-Business-Platform`
Branch of record: `main`

## Operating rule

Never close a gate from documentation alone.

Required lifecycle:

`Audit → Implement → Test → Inspect evidence → Re-audit → Close`

A gate is CLOSED only when the implementation, negative-path behavior, persistence, authorization/scope, accounting effects, idempotency, audit trail, restart behavior, and HTTP-level evidence agree.

## Closure sequence

### P0
- [ ] P0-01 Tenant/company/branch/warehouse isolation
- [ ] P0-02 Inventory reconciliation authorization and scope
- [ ] P0-03 Reconciliation posting atomicity/idempotency
- [ ] P0-04 Period lock enforcement across financial mutations
- [ ] P0-05 Manufacturing → Inventory → WIP → Financial Event → GL → Audit atomicity
- [ ] P0-06 Payroll production workflow + Payroll ↔ GL reconciliation

### P1
- [ ] P1-01 Unified reconciliation contract
- [ ] P1-02 Durable report snapshots + cryptographic verification
- [ ] P1-03 Unified duplicate protection
- [ ] P1-04 Opening balance reconciliation
- [ ] P1-05 Full source-document traceability
- [ ] P1-06 Import rollback/failure safety
- [ ] P1-07 Period close/reopen + maker-checker
- [ ] P1-08 Dashboard/report/canonical-source consistency

### P2 / hardening
- [ ] Complete route-to-permission matrix
- [ ] Unified exception/error aggregation
- [ ] Remove remaining financial defaults/silent zero fallbacks
- [ ] Expand HTTP-level coverage
- [ ] Browser RTL/LTR and responsive acceptance
- [ ] Configuration-required messaging
- [ ] Durable business numbering where required
- [ ] Build/resource hardening

## Certification gate

Before declaring production closure, the repository must pass the full workflow:

`lint → build → regression → P0 controls → P0 boundaries → reconciliation → invoice HTTP → commercial E2E → exports → first-run → fiscal close → accounting certification → full-system certification → localization/costing → browser acceptance → security audit → diff check`

The GitHub Actions workflow at `.github/workflows/production-closure-gate.yml` is the automated gate.

## Important current audit observations

These must remain under verification until proven closed:

- `src/engine/reconciliationEngine.ts` contains hardcoded opening values and disabled Payroll/Open-Balance sources.
- Reconciliation calculations currently need proof that they use complete period movement contracts rather than permissive master-record balances.
- The full-system certification harness uses a dedicated test DB and demo/test environment flags; this is useful runtime evidence but is not equivalent to clean production first-run proof.
- The transaction-boundary suite still documents unavailable proof areas; those must be replaced with real runtime evidence, not weakened assertions.
- External WPS, bank-feed, and statutory-provider integrations remain external dependencies and must never be represented as successful without real provider evidence.

## Codespace execution rule

The Codespace agent should execute GitHub Issue #1 from start to finish and update this tracker after each verified gate.

Do not ask the owner to restate the requirements. Use the issue, this tracker, and the current repository state as the source of truth.

## Final deliverables

- Working code
- Automated tests
- Machine-readable evidence
- Updated certification/closure report
- Explicit remaining external dependencies
- Explicit remaining gaps, if any

Final status may be `PRODUCTION CLOSED` only after a fresh full re-audit and a green Production Closure Gate.
