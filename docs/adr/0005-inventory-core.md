# ADR 0005: Inventory Core posting, reservation and ATP

- Status: Accepted implementation baseline; mandatory team review pending
- Date: 2026-07-17

Inventory Core exclusively owns Batch, Balance, Reservation and Movement Ledger. `RESERVED` is not a stock status. ATP is sellable AVAILABLE on-hand minus active, unexpired reservation.

Posting uses one PostgreSQL transaction through `inventory.post_movement`: validate whole cases, serialize the SKU/batch key, conditionally debit without negative balance, credit, append ledger, outbox and audit. The document command key makes retry idempotent. Reversal is a new movement referencing the original; ledger rows are never changed.

Reservation creation serializes SKU/warehouse, recomputes ATP inside the transaction, then inserts. Release/cancel/expiry updates only the reservation overlay and never creates movement. Consumers must use the public contract and may not write Inventory Core tables.

Production database roles must grant application code EXECUTE on approved functions and read access on views while revoking direct balance/ledger writes. Final grants depend on the production role names and are therefore deployment configuration, not embedded local credentials.
