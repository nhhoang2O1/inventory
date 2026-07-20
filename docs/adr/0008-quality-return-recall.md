# ADR 0008: Quality containment, returns, expiry and batch recall

- Status: Accepted
- Date: 2026-07-20
- Scope: Phase 8 Quality/Recall

## Context

Quality incidents, customer returns, expired stock and recalls must remove affected whole cases from sellable ATP without giving Quality/Recall direct ownership of inventory balance or ledger. Recall containment is enterprise-critical and must also stop new distribution while a batch is active.

## Decision

1. A manual QualityCase starts DRAFT and becomes CONTAINED only when Inventory Core posts every case line from its current status/location to BLOCKED, QUARANTINED or DAMAGED.
2. CustomerReturn uses creator/approver/poster separation. POSTED receives external whole cases directly into QUARANTINED and creates a linked CONTAINED QualityCase.
3. ExpiryRun uses a supplied business date and atomically moves every expired AVAILABLE balance in the warehouse to EXPIRED. A linked QualityCase owns later disposition.
4. A disposition is full-scope and single-use for its QualityCase. Reporter/requester, approver and poster are independent actors. RELEASE, DESTROY, RETURN_TO_SUPPLIER and RECLASSIFY_DAMAGED all post through `inventory.post_movement`.
5. Recall is batch-level and may span warehouses. Approval activates a database ledger guard that rejects distribution from AVAILABLE and any movement into AVAILABLE for that batch.
6. Recall containment requires a quarantine location for every warehouse currently holding the batch. Each warehouse receives its own RECALLED QualityCase; historical ledger movements provide traceability.
7. Recalled stock cannot use the generic RELEASE disposition. Recall closes only after every linked QualityCase is CLOSED and no RECALLED on-hand remains.
8. Document state, movement, audit and outbox are committed atomically. Posting commands persist idempotency key and request hash.

## Consequences

- ATP falls automatically because BLOCKED, QUARANTINED, DAMAGED, EXPIRED and RECALLED are canonical non-sellable statuses.
- Quality and Recall never write `inventory.inventory_balance` or `inventory.inventory_movement_ledger` directly.
- An approved recall can block outbound, transfer and available receipt commands until containment/disposition closes the recall.
- Recall scope must cover every warehouse with positive batch on-hand; otherwise containment fails deterministically.
