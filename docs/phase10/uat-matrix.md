# Phase 10 UAT Matrix

Status values are `PASS`, `FAIL`, `BLOCKED`, `MANUAL` or `N/A`. Business sign-off is required even when an automated test exists.

| ID | Scenario | Automated evidence | Release evidence required |
|---|---|---|---|
| UAT-01 | PO with multiple batches and partial receipts | `phase5-completion-integration.test.mjs` | Warehouse and purchasing sign-off |
| UAT-02 | Concurrent FEFO allocation without oversell | `outbound-integration.test.mjs` | Warehouse sign-off |
| UAT-03 | FEFO override approval and audit | `outbound-integration.test.mjs` | Warehouse manager sign-off |
| UAT-04 | Customer return, disposition and stock status | `phase8-integration.test.mjs` | Quality sign-off |
| UAT-05 | Stocktake freeze, count, variance and posting | `phase7-integration.test.mjs` | Warehouse and accounting sign-off |
| UAT-06 | Inter-warehouse transfer lifecycle | `phase7-integration.test.mjs` | Both warehouses sign-off |
| UAT-07 | Returnable packaging/deposit ledger | Conditional; business decision D-005 remains required | Mark `N/A` only with business-owner approval; otherwise `BLOCKED` |
| UAT-08 | Append-only movement reversal | `phase7-integration.test.mjs` | Inventory controller sign-off |
| UAT-09 | MRSL block/approved exception | `phase5-completion-integration.test.mjs` | Quality sign-off |
| UAT-10 | ROP/Safety Stock creates Draft PR only | `phase9-integration.test.mjs` | Purchasing sign-off |
| UAT-11 | Multi-warehouse recall traceability | `phase8-integration.test.mjs` | Quality sign-off |
| UAT-12 | Supplier KPI drill-down | `phase9-integration.test.mjs` | Purchasing sign-off |
| UAT-13 | RBAC, audit and authenticated session | `iam-access.test.mjs`, `phase10-integration.test.mjs` | Security owner sign-off |
| UAT-14 | Retry, idempotency, dead-letter and replay | `phase9-integration.test.mjs` | Integration owner sign-off |
| UAT-15 | Concurrent ATP/reservation integrity | `inventory-core.test.mjs`, `outbound-integration.test.mjs` | Warehouse sign-off |
| UAT-16 | Performance, backup/restore and recovery | Phase 10 scripts; environment-specific | Operations sign-off with measurements |

For every executed case, attach release version, environment, actor, input data IDs, expected result, actual result, timestamp and evidence link. Summarize the approved matrix in a `UAT` release gate; do not record `PASSED` while any applicable case is `FAIL`, `BLOCKED` or unsigned.
