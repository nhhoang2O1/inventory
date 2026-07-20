# Phase 5 gap assessment

- Evaluated branch base: `main` at merge commit `768f737`
- Phase 5 source commit: `e4abb97`
- Evaluation date: 2026-07-19

## Verified implementation

- Supplier master with standard lead-time days.
- Purchase Order header/lines, approval transition and expected delivery date.
- Goods Receipt header/lines, partial receipt and 10% over-receipt tolerance.
- POSTED receipt calls Inventory Core movement in the same database transaction as document and PO quantity updates.
- Inbound MRSL modes REJECT and QUARANTINE.
- Integration test proves PO -> partial receipt -> inventory balance/ledger on PostgreSQL.
- Phase 6 adds maintenance of `inventory.batch.first_received_date`, which is required for the FEFO receipt-date tie-break.

## Missing against the Phase 5 delivery plan

1. Purchase Request and its approval/conversion workflow are not implemented.
2. Business calendar and DeliverySchedule are not implemented; expected delivery currently adds calendar days to order date rather than using PO sent/accepted time plus a business calendar.
3. PO approve and inbound commands do not yet enforce the shared RBAC/warehouse-scope and four-eyes Approval contract.
4. `ALLOW_WITH_APPROVAL` MRSL currently rejects with a message; it does not consume an approved exception request.
5. Supplier KPI source data is not implemented.
6. Phase 5 has no dedicated OpenAPI contract or operator UI.
7. Goods Receipt creation carries its idempotency key in the request body rather than the standard header and canonical command record.

## Gate conclusion

The implemented Phase 5 vertical slice compiles and its database integration test passes, so it supplies the inventory and batch data needed by Phase 6. It is not the complete Phase 5 Definition of Done and should not be described as release-ready until the missing items above are closed.
