# ADR 0010: Complete inbound through explicit approvals, schedules and Inventory Core

## Status

Accepted — 2026-07-20

## Decision

Inbound purchasing uses warehouse-scoped Purchase Requests and Purchase Orders with optimistic version checks and four-eyes decisions. Supplier lead time is evaluated by an auditable business calendar and materialized as line delivery schedules.

Goods Receipts require explicit confirmation before posting. Posting updates PO receipt progress and delivery schedules in the same transaction, while inventory ownership remains exclusive to Inventory Core through `inventory.post_movement`.

MRSL, over-receipt and minimum-quantity overrides are separate exception records. The requester cannot approve their own exception, and an approved exception is consumed once by receipt posting.

Mutation retries use `Idempotency-Key` plus a canonical request hash in `platform.idempotency_record`. Reusing a key with a different request is rejected.

## Consequences

- Every warehouse workflow requires both permission and active warehouse scope.
- Legacy DRAFT → APPROVED and DRAFT → POSTED shortcuts are no longer accepted.
- Delivery dates cross the PostgreSQL/Node boundary as `YYYY-MM-DD` to avoid timezone drift.
- The 10% database over-receipt ceiling remains a non-bypassable invariant.
