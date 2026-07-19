# ADR 0009: Planning snapshots, reporting ledger and outbox delivery

## Status

Accepted for Phase 9.

## Context

Phase 9 needs deterministic replenishment, cross-module reporting, supplier KPI, inventory valuation and reliable external delivery without allowing those modules to mutate canonical inventory state. Accounting has not selected a broader enterprise costing method or external system of record, so the implementation must keep assumptions visible and replaceable.

## Decision

1. A replenishment run is unique by warehouse and business date. It stores ATP, active reservations, reliable inbound, sales window, average daily sales, lead-time demand, safety stock, ROP, coverage demand, rounding multiple and the final suggestion.
2. A run creates at most one `DRAFT` purchase request per SKU, warehouse and suggestion date. Planning never creates or approves a Purchase Order.
3. Reports read public database contracts and persist immutable result snapshots with a source cutoff. Warehouse and cost permissions are checked separately.
4. `reporting.inventory_cost_ledger` is an append-only companion to each Inventory movement. Phase 9 uses batch actual PO-line price when available and marks stock `UNVALUED` otherwise. It never changes balance or movement rows.
5. Supplier KPI publishes its period, timezone, exclusions, partial-receipt handling and capped fill-rate formula, and retains line-level drill-down.
6. Outbox events fan out through active event subscriptions. Delivery state is per endpoint, uses an event ID as the downstream idempotency key, exponential backoff with jitter, bounded retry, dead-letter state and audited replay. Replay resets only cycle attempts; lifetime attempt history stays append-only.

## Consequences

- Re-running the same planning date returns the saved snapshot and cannot create duplicate Draft PRs.
- Historical reports do not silently change when policies or source data change later.
- Unvalued inventory remains visible instead of being assigned an invented cost.
- POS, ERP, accounting and notification adapters can be configured after endpoint and secret decisions without changing business modules.
- A future accounting-approved costing method requires a new forward migration and a new valuation policy; existing cost history is not rewritten.
