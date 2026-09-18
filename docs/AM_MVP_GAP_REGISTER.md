# AM Business OS MVP Gap Register

| Priority | Gap | Status | Evidence / Next Action |
|---|---|---|---|
| P0 | Canonical branding certification expected stale AM ERP/orange values | RESOLVED | Runtime and P0-08/P0-09 now align to AM Business OS and gold `#C9A227`; rerun full regression after changes. |
| P0 | Production credential fallback | RESOLVED | Production startup now fails closed when bootstrap credentials are required and absent. |
| P0 | Global API authentication boundary | RESOLVED | Central guard, sequential client auth, token persistence, and 10 lifecycle tests verified via `verify_session_lifecycle_and_security.ts`. |
| P0 | Clean installation without demo transactions | RESOLVED | `npm run test:production-first-run-closure` proves empty operational collections and production onboarding without demo transactions. |
| P1 | Future modules visible in normal navigation | RESOLVED | Sidebar filters explicit future entries; feature registry still needs server-authoritative integration. |
| P1 | Developer test tab visible to users | RESOLVED | Sales hardening tab restricted to Super Admin. Other admin/developer surfaces need inventory. |
| P1 | Fabricated frontend notifications and recent pages | RESOLVED | Initial client state now empty unless backed by local user history. |
| P1 | Sales and purchasing end-to-end business-flow proof | RESOLVED | `npm run test:commercial-e2e` proves purchase-to-stock-to-sale-to-payment reconciliation and audit evidence. |
| P1 | Backup/restore production drill | RESOLVED | `npm run test:backup-restore` proves restore persistence and rejects tampered checksums without replacing current data. |
| P1 | CI/CD and security scanning | RESOLVED | `.github/workflows/production-certification.yml` runs lint, regression, browser dependencies, final certification, and high-severity audit. |
| P2 | URL navigation and deep-link persistence | RESOLVED | `npm run test:browser-acceptance` verifies `?module=sales` survives initialization and renders the requested workspace. |
| P2 | Legacy orange UI token consolidation | RESOLVED | Future-module placeholder gradient now uses approved brand gold tokens; contextual warning/status colors remain semantic. |
