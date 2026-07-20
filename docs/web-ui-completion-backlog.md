# Web UI completion backlog

This backlog is the implementation source for finishing the React UI while
keeping the backend as the authority for permissions, state transitions,
whole-case quantities, FEFO, version checks and four-eyes approval.

## Status matrix

| ID | Work item | Current state | Priority | Completion evidence |
| --- | --- | --- | --- | --- |
| UI-001 | Shared API client, session, correlation, idempotency and Problem Details | Implemented in `apps/web/src/apiClient.ts`; direct request/alert validator passes | P0 | `npm run web-ui:validate`, shared loading/error/success primitives |
| UI-002 | Inbound / goods receipt | PO → batch → GR → confirm → post is API-backed; exception approval and upload remain contract work | P0 | Supplier/PO data is no longer hardcoded; draft command and fake attachments removed |
| UI-003 | Inventory / transfer / stocktake | ATP, refresh, transfer lifecycle and blind-stocktake lifecycle are API-backed; count-entry form and inter-warehouse transit UX remain | P0 | Versioned commands and detail panels; expected quantity remains hidden in blind count |
| UI-004 | Outbound / FEFO / pick | Create, submit, approve, automatic FEFO allocation, pick-task creation and quantity-aware scan are implemented; manual override UI remains | P0 | No frontend status mutation; scan sends allocation, barcode, quantity and task version |
| UI-005 | Approval center | PO approval is real; aggregate inbox and PO reject endpoint do not exist | P0 | Unsupported tabs/actions are visibly blocked; no local fake approval rows |
| UI-006 | Quality / returns / expiry / recall | Quality/expiry/return/recall lists and create/contain/approve/post/close commands are API-backed; detail-level disposition/return/recall actions remain | P0 | Quality/expiry/return/recall data is API-backed and actor separation is preserved |
| UI-007 | Dashboard / financial / reporting | Dashboard and reporting use typed cards/tables; export and richer filters remain | P1 | Raw JSON rendering removed; D-005 remains visibly `BLOCKED` |
| UI-008 | UX, validation, permission visibility and responsive behavior | Shared feedback primitives and role-scoped sidebar exist; a11y/responsive audit remains | P1 | No command `alert()`; backend remains permission/state authority |
| UI-009 | E2E and UAT automation | Static Web UI contract validator added; Playwright smoke is still pending | P1 | `npm run web-ui:validate`; browser UAT must still be executed |
| UI-010 | Release and business sign-off | Build/OpenAPI/tests/release gate pass on clean test DB; business sign-off remains pending | P0 | `npm run build`, `npm run openapi:validate`, `npm test`, `npm run phase10:gate` |

## Backend contracts used

The UI must use the existing `/api/v1` contracts for IAM, purchasing,
receiving, inventory, transfers, stocktakes, outbound, quality, returns,
recall, planning and reporting. A new approval inbox endpoint is a separate
backend contract task; the UI must not emulate an inbox by deleting local
rows. D-005 returnable packaging/deposit remains `BLOCKED` until the business
decision and ledger contract are approved.

## Delivery order

1. UI-001 shared request and feedback primitives.
2. UI-004 outbound and UI-005 approvals.
3. UI-006 quality, returns, expiry and recall.
4. UI-003 transfer and blind stocktake lifecycle.
5. UI-002 inbound cleanup.
6. UI-007 dashboard and financial presentation.
7. UI-008 UX/a11y, UI-009 E2E and UI-010 release evidence.

## Acceptance rules

- No business data or successful command may be represented by hardcoded rows or
  `alert()` calls.
- The browser never becomes the source of truth for state, quantity, FEFO,
  permission or four-eyes checks.
- Every command sends the backend-required `expectedVersion`,
  `Idempotency-Key` and `X-Correlation-Id`.
- Blind stocktake does not reveal expected quantity before the backend permits
  it.
- D-005 and missing backend commands remain visibly blocked instead of being
  guessed in the frontend.
