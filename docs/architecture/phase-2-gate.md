# Phase 2 Architecture Gate

## Deliverables

- [x] Modular monolith, worker và module ownership được mô tả.
- [x] Monorepo skeleton cho API, worker, web, contracts và database.
- [x] PostgreSQL Docker Compose có health check.
- [x] Migration runner forward-only, checksum và advisory lock.
- [x] Foundation migration có idempotency, outbox và append-only audit.
- [x] OpenAPI 3.1 có success envelope, Problem Details, correlation và idempotency headers.
- [x] ADR modular monolith, PostgreSQL SQL-first và whole-case quantity.
- [x] CI definition và architecture verification script.
- [x] Local runbook trong README.

## Evidence cần chạy

- [x] `npm run verify` chạy không cần dependency ngoài.
- [x] `npm install` tạo `package-lock.json` thành công.
- [x] `npm run build` pass cho tất cả workspace.
- [x] `npm test` pass sau khi cài dependency.
- [x] `docker compose --env-file .env.example config --quiet` pass ngày 2026-07-17.
- [x] PostgreSQL container healthy trên host port `55432`.
- [x] Migration chạy mới thành công và chạy lại không thay đổi dữ liệu.
- [x] API health trả HTTP 200 và correlation header.
- [x] Web production build chứa API health integration; runtime UI acceptance chuyển sang Phase 3 khi có màn hình nghiệp vụ.
- [x] Worker/Node PostgreSQL client kết nối được `platform.outbox_event`.
- [ ] Người B review API/frontend mockability.
- [ ] Người C review CI/security/deployment/observability.

## Gate status

`TECHNICAL PASSED – TEAM REVIEW PENDING`: Toàn bộ implementation/runtime evidence bắt buộc của Phase 2 đã xanh ngày 2026-07-17. Người B và Người C vẫn phải review đúng ownership trước khi merge foundation vào shared `main`; đây là review governance, không còn là blocker kỹ thuật build/migration.

## Kết quả kiểm tra ngày 2026-07-17

| Kiểm tra | Kết quả | Bằng chứng/Ghi chú |
|---|---|---|
| Foundation verifier | PASS | 20 artifact bắt buộc và architecture import rule pass |
| JSON manifests | PASS | 6/6 `package.json` parse thành công |
| Docker Compose parse | PASS | `config --quiet` exit code 0 |
| Dependency install | PASS | `package-lock.json` được tạo; Vite 8 dùng `@vitejs/plugin-react` 6.0.3 tương thích |
| PostgreSQL runtime | PASS | PostgreSQL 17 healthy tại `localhost:55432`; không xung đột service cổng 5432 hiện hữu |
| Build/test | PASS | contracts, database, NestJS API, worker và Vite web build; 6/6 foundation/domain tests pass |
| Migration | PASS | `0001_phase2_foundation.sql` applied; lần hai idempotent; status `applied` |
| API smoke | PASS | HTTP 200; correlation ID trả đúng request |
| Database smoke | PASS | idempotency record, outbox event và audit event tồn tại |
| Worker DB contract | PASS | Node/pg kết nối và query `platform.outbox_event` thành công |
| Git repository | READY | Repository `work/warehouse-wms` đã khởi tạo nhánh `main`, chưa commit |

Script `scripts/phase2-admin-gate.ps1` đã ghi trạng thái `PASSED` lúc `2026-07-17T18:32:27+07:00`. Các cảnh báo type stripping trong log đã được loại khỏi lệnh migration sau gate bằng cách chạy JavaScript đã compile.
