# ADR-0001: Modular monolith with separate worker

- Status: Accepted for MVP
- Date: 2026-07-17

## Context

Đội có ba developer và mười phase. Inventory transaction phải nhất quán, trong khi Phase 5–7 cần làm song song sau Core Gate.

## Decision

Dùng một NestJS modular monolith API, một React web, một PostgreSQL database và một worker process dùng chung repository. Module có owner/schema logic và chỉ giao tiếp qua public contract.

## Consequences

- Transaction xuyên document và inventory đơn giản, dễ audit và test.
- Deploy/monitor ít thành phần hơn microservices.
- Cần architecture test và review để ngăn module coupling.
- Chỉ tách service khi có bằng chứng ownership/tải/deploy độc lập; event/outbox tạo seam để tách sau.
