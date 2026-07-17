# Module Boundaries

| Module | Public contract | Owned data | Forbidden dependency |
|---|---|---|---|
| IAM/Approval | actor, permission, warehouse scope, approval decision | user, role, permission, policy | Inventory repository |
| Catalog | SKU and wholesale quantity policy query | product, SKU, UOM, packaging specification, barcode | Balance/movement |
| Warehouse | location/capacity/mixing query | warehouse, zone, location | Inventory mutation |
| Inventory Core | ATP query, reserve/release, post/reverse | batch, balance, reservation, movement, cost ledger | PO/order workflow |
| Purchasing/Receiving | PO and receipt commands | supplier, PR, PO, receipt | Direct balance write |
| Outbound | issue/pick/FEFO workflow | issue request, pick task, goods issue | Own ATP formula |
| Transfer/Stocktake | transfer/count/adjustment workflow | transfer, count, adjustment | Direct balance write |
| Quality/Recall | case, disposition, containment | quality case, return, recall | Direct balance write |
| Planning/Reporting | queries, draft proposal | ROP policy, read model, export job | Source transaction update |
| Integration/Audit | publish/reconcile/audit append | outbox, integration state, audit | Business decision ownership |

Folder convention trong API:

```text
modules/<module>/
  public/          # module, DTO, command/query interface được phép import
  application/     # use case
  domain/          # aggregate, value object, policy
  infrastructure/  # database/external adapter
  internal/        # implementation không được import chéo
```
