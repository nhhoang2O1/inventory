# Phase 3 Kickoff – IAM & Master Data

## Mục tiêu

Tạo IAM và Master Data đủ ổn định để Phase 4 xây Inventory Core, đồng thời freeze public contract mà Phase 6/7 có thể mock độc lập.

## Work packages

| WP | Nội dung | Gate evidence |
|---|---|---|
| P3-WP01 | User, Role, Permission, WarehouseScope | Permission/warehouse-scope negative tests |
| P3-WP02 | ApprovalPolicy baseline và audit | Four-eyes policy contract + append-only audit |
| P3-WP03 | Product, SKU, nguyên kiện UOM | Product 1:N SKU FK/constraint/tests |
| P3-WP04 | PackagingSpecification, Barcode | Unique active barcode; không break-pack |
| P3-WP05 | WholesaleQuantityPolicy | Integer minimum inbound/outbound, effective dating |
| P3-WP06 | Warehouse, Zone, Location | Hierarchy, status, unique location code |
| P3-WP07 | CapacityRule, MixingPolicy | Configurable dimensions and policy validation |
| P3-WP08 | Import/export và OpenAPI mock | Validation report, idempotent import, consumer mock |

## Thứ tự đề xuất

1. Schema/ADR và public contract.
2. IAM + audit.
3. Catalog + wholesale policies.
4. Warehouse topology + policies.
5. Import/export, OpenAPI và full gate regression.

## Review ownership

- Người A: implementation owner.
- Người B: Product/Warehouse API và UI consumer contract.
- Người C: RBAC/Audit/import/security negative paths.
