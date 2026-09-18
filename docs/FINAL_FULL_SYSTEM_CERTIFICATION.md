# Final Full-System Certification Evidence

The final full-system runner distinguishes the production-equivalent runtime
certification from the isolated HR/payroll/commission harness.

## Production-equivalent certification

Command: `npm run test:production-equivalent-certification`

Evidence: real SQLite persistence, real HTTP APIs, real authentication and
authorization, canonical GL posting, rejected unbalanced posting, and server
restart persistence with `DEMO_MODE=false` and `ALLOW_DEMO_SEED_DATA=false`.

## Isolated runtime harness

Command: `npm run test:final-full-system-certification`

This remains a regression harness for the full operational scenario. It is not
the sole evidence for production behavior.

## Status

The certification result is valid only when the command output and generated
machine-readable evidence agree. Target-environment operational sign-off is not
included in this repository-level certification.
