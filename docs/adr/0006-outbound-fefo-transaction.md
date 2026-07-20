# ADR 0006: Outbound FEFO and Goods Issue transaction boundary

- Status: Accepted
- Date: 2026-07-19
- Scope: Phase 6 Outbound

## Context

Outbound owns Issue Request, FEFO allocation, PickTask and GoodsIssue. Inventory Core exclusively owns ATP, reservation, movement and balance. Goods Issue POSTED must update the document, fulfill reservations, debit on-hand, append audit and emit outbox events atomically.

## Decision

1. Issue Request follows `DRAFT -> SUBMITTED -> APPROVED -> ALLOCATED -> PICKING -> POSTED`, with cancellation allowed only before POSTED.
2. Approval checks canonical ATP, while allocation calls `inventory.reserve_inventory` inside the Outbound database transaction. The Core advisory lock remains the concurrency boundary.
3. FEFO candidates contain only AVAILABLE, unexpired, MRSL-compliant stock. Ordering is expiration date, first received date, batch ID and location ID.
4. Manual selection is compared with the automatic FEFO plan. A different plan requires `OUTBOUND.FEFO_OVERRIDE`, a non-empty reason and an append-only audit event.
5. Picking confirms a current SKU barcode and never changes balance. Partial picking is retained as backorder only when the request policy allows it.
6. Goods Issue calls `inventory.fulfill_reservation` before `inventory.post_movement` for every picked allocation, then updates GoodsIssue/IssueRequest, audit and outbox before the same transaction commits.
7. Outbound never creates `RESERVED` as a stock status and never calculates ATP independently.

## Consequences

- Concurrent allocations cannot reserve more than canonical ATP, and balance remains unchanged until POSTED.
- A Phase 6 migration adds only Outbound-owned tables, permissions, views and state validation; it references but does not redefine Inventory Core tables or formulas.
- Inventory Core posting functions remain the public SQL transaction contract used by operational modules.
- Changes to the posting function or reservation invariants require Core-owner review.
