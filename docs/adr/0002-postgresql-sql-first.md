# ADR-0002: PostgreSQL and SQL-first migration/repository baseline

- Status: Accepted for Phase 2
- Date: 2026-07-17

## Context

Inventory cần ACID, check/unique constraint, `SELECT ... FOR UPDATE`, advisory lock và truy vấn reconciliation rõ ràng. ORM không được che khuất transaction hoặc sinh migration khó kiểm soát.

## Decision

Dùng PostgreSQL 17 và migration SQL forward-only có checksum. Data access baseline dùng `pg` qua repository/application transaction boundary. Có thể thêm typed query builder sau spike, nhưng SQL migration và database constraint vẫn là nguồn chuẩn.

## Consequences

- Row lock và SQL hiệu năng được kiểm soát rõ.
- Developer phải review SQL và hiểu transaction.
- Applied migration không được sửa; thay đổi bằng migration mới.
- Phase 4 bắt buộc concurrency test trước khi freeze Inventory Core.
