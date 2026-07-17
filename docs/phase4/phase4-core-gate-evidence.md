# Phase 4 Inventory Core Gate evidence

Technical implementation complete on 2026-07-17; mandatory two-person review and main/tag actions remain pending.

- Canonical statuses exclude RESERVED.
- Balance unique by SKU + Batch + Warehouse + Location + StockStatus and cannot be negative.
- Reservation is a separate overlay; ATP = sellable on-hand - active reservation.
- Reservation creation uses transaction advisory locking; release is idempotent and creates no movement.
- Posting debits/credits, ledger, outbox and audit atomically and replays by document command key.
- Ledger and approval history are append-only; reversal is a new referenced movement.
- Reconciliation view compares ledger-derived quantities with balance.
- Build PASS; 37 tests PASS.
- Migrations 0001–0005 applied and repeat-safe.
- Runtime rollback gate: receipt 100, idempotent retry, reserve 60, second 60 rejected, repeated release, ATP 100, one movement, variance zero.
- Real concurrent gate: two simultaneous reservations of 60 against ATP 100 produced exactly one active reservation of 60; the other failed `INVENTORY_ATP_INSUFFICIENT`.
- Fixed-ID concurrency test data was removed and verified at zero remaining rows.

OpenAPI consumer contract: `docs/openapi/inventory-core-v1.yaml`.

The plan requires Person B/C review and creation of `phase-4-core-gate` from clean `main`; this branch evidence does not impersonate those approvals or create the tag prematurely.
