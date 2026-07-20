# ADR 0007: Transfer, stocktake and append-only reversal boundaries

- Status: Accepted
- Date: 2026-07-20
- Scope: Phase 7 Transfer & Stocktake

## Context

Phase 7 introduces physical location transfers, two-step warehouse transfers, blind stocktake, inventory adjustment and reversal. Inventory Core remains the sole owner of balances and movement ledger. Phase 7 workflows must not create a second stock formula or modify Core tables directly.

## Decision

1. A location transfer posts AVAILABLE source directly to AVAILABLE destination. A warehouse transfer posts source to a location in a TRANSIT warehouse with `IN_TRANSIT`, then posts one or more receipts to the destination.
2. `IN_TRANSIT` remains enterprise-owned but non-sellable, so the canonical ATP view excludes it without a separate transfer formula.
3. Partial receipt is explicit. Available, damaged and missing quantities are recorded independently; damaged/loss discrepancies require a second actor to resolve before close.
4. Starting stocktake locks every scoped location and captures balance ID, quantity and version. Non-adjustment movement into or out of a `STOCKTAKE` location is rejected by a database trigger.
5. Count entries are append-only and round-specific. Blind sessions hide system quantity during COUNTING/RECOUNT. Variance outside the configured threshold forces round two.
6. Creator/counter, variance approver and adjustment poster are separate actors. Inventory stays unchanged until an approved adjustment is POSTED through `inventory.post_movement`.
7. Reversal is a new command and new ledger movement with `reversal_of`. The original movement is never edited or deleted, each movement is reversed at most once, and requester/approver/poster are separate actors.
8. Every posting transaction includes business state, Inventory Core movement, audit and outbox changes atomically. Optimistic version and idempotency checks guard repeat or stale commands.

## Consequences

- Transfer and stocktake modules own their workflow records but have no direct balance write capability.
- Physical movements serialize with stocktake location locking through row locks plus the ledger guard trigger.
- Reversal can fail if the reverse source no longer contains sufficient stock; it never silently creates a negative balance.
- Operational APIs require warehouse-scoped permissions and expose explicit workflow state/version.
