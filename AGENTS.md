# AGENTS.md

## Source of truth

- Business requirement: `../docs/Requirement_Quan_Ly_Kho_Bia_Nuoc_Ngot_v3.1.md`.
- Technical requirement: `../docs/Yeu_Cau_Ky_Thuat_Project_Quan_Ly_Kho_v1.0.md`.
- Delivery plan: `../docs/Ke_Hoach_10_Phase_3_Nguoi_Git_Parallel_v3.1.md`.
- Architecture Gate: `docs/architecture/phase-2-gate.md`.

## Non-negotiable rules

1. Kho chỉ quản lý số nguyên thùng/két/keg; không xé lẻ chai/lon/lốc.
2. Product có một hoặc nhiều SKU; SKU thuộc đúng một Product.
3. `minimum_inbound_quantity` và `minimum_outbound_quantity` là policy có hiệu lực, không hard-code toàn hệ thống.
4. Chỉ Inventory Core được sở hữu balance, reservation, ATP và movement. Phase 3 không tạo hoặc ghi các bảng này.
5. Module chỉ import public contract; không import `internal`/`infrastructure` của module khác.
6. Migration SQL forward-only; không sửa migration đã applied. Quantity dùng integer/bigint, money dùng decimal, timestamp dùng UTC.
7. Barcode đang hiệu lực nhận diện duy nhất một SKU nguyên kiện; không tạo barcode phục vụ xé lẻ.
8. Mọi thay đổi master data nhạy cảm phải có audit; xóa danh mục đã phát sinh giao dịch phải dùng deactivate/soft-delete policy.
9. Không commit `.env`, secret, `node_modules`, log hoặc generated `dist`.
10. Trước commit: `npm run build`, `npm test`, migration status và `git diff --check` phải pass.

## Phase 3 definition of done

- IAM/warehouse scope negative tests pass.
- Product 1:N SKU được enforce bằng FK/constraint và test.
- Barcode uniqueness và wholesale quantity policy có effective dating.
- Warehouse/Zone/Location/Capacity/MixingPolicy contract được review.
- OpenAPI/mock usable cho Phase 6/7.
- Migration chạy từ Phase 2 database và chạy lại an toàn.
