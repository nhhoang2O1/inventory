# Phase 6 completion evidence

- Branch: `feature/phase-6-outbound`
- Base: `main` merge of Phase 4 and Phase 5 (`768f737`)
- Date: 2026-07-19

## Delivered

- Outbound schema for CustomerReference, IssueRequest/Line, Allocation, PickTask/Line, idempotent PickConfirmation, GoodsIssue/Line and effective-dated outbound MRSL policy.
- Explicit Issue Request state machine: DRAFT -> SUBMITTED -> APPROVED -> ALLOCATED -> PICKING -> POSTED, with pre-POSTED cancellation.
- Whole-case and effective minimum outbound quantity validation.
- Canonical ATP reservation through `inventory.reserve_inventory`; Outbound does not copy the ATP formula or introduce a RESERVED StockStatus.
- FEFO allocation ordered by expiration, first receipt, batch and location, with unavailable/expired/MRSL-ineligible sources excluded.
- Manual FEFO override protected by `OUTBOUND.FEFO_OVERRIDE`, mandatory reason and append-only audit evidence.
- Barcode-validated picking, repeat-safe scan commands, partial pick and backorder quantities without changing physical on-hand.
- Atomic Goods Issue POSTED transaction: reservation fulfillment, Inventory Core movement/balance, document state, audit and outbox.
- Cancellation releases reservations without creating a movement.
- Warehouse-scoped permissions for view, create, approve, allocate, pick, post, cancel and FEFO override.
- OpenAPI contract, ADR and a responsive Phase 6 operator console.

## Automated evidence

- Workspace build: passed for contracts, database, API, worker and web.
- Clean migration: `0001` through `0012` applied and reported as applied on PostgreSQL 17.
- Full suite: 65 tests passed, 0 failed.
- Phase 5 E2E: Supplier -> PO -> partial Goods Receipt -> movement/balance passed.
- Phase 6 integration: FEFO split, barcode pick, Goods Issue POSTED and stable idempotent replay passed.
- UAT-02/UAT-15: two concurrent 60-case allocations against 90 ATP produced exactly one success, one deterministic failure, Active Reservation 60 and ATP 30.
- UAT-03: non-FEFO batch selection was rejected without permission, then accepted with permission/reason and audit metadata.
- Ledger/balance reconciliation for the Phase 6 integration SKU reported zero variance.

## Release notes

- The repository-wide authentication baseline still uses `X-Actor-Id`; production OIDC/JWT hardening is outside this phase.
- Phase 5 gaps are recorded in `docs/phase5/phase5-gap-assessment.md` and must be closed before calling the combined operations release complete.
