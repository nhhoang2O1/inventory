# Warehouse WMS

Architecture foundation cho hệ thống quản lý kho bán sỉ bia và nước ngọt. Kho chỉ quản lý nguyên kiện thùng/két/keg; không xé lẻ chai/lon/lốc.

## Yêu cầu

- Node.js 22.12–22.x; baseline container: 22.23.1 LTS.
- npm 10.x.
- Docker Desktop với Docker Compose v2.

## Chạy nhanh

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev:api
```

Ở terminal khác:

```powershell
npm run dev:web
npm run dev:worker
```

API health: `GET http://localhost:3000/api/v1/health`.

PostgreSQL của WMS được publish ở `localhost:55432` để tránh xung đột với PostgreSQL mặc định trên cổng 5432.

Chạy toàn bộ stack bằng container sau khi đã có registry/network:

```powershell
docker compose --profile full up --build
```

## Kiểm tra foundation không cần dependency

```powershell
npm run verify
docker compose config
```

## Cấu trúc

- `apps/api`: NestJS modular monolith HTTP API.
- `apps/worker`: worker xử lý transactional outbox.
- `apps/web`: React responsive web skeleton.
- `packages/contracts`: contract/error types dùng chung.
- `packages/database`: SQL migration framework và schema foundation.
- `docs/openapi`: REST contract v1.
- `docs/architecture`: kiến trúc, ERD, module boundary và ADR.

## Quy tắc bắt buộc

- Chỉ Inventory Core được sở hữu balance/reservation/movement từ Phase 4.
- Module nghiệp vụ gọi public application contract; không ghi trực tiếp bảng tồn.
- Mọi command thay đổi trạng thái dùng correlation ID; command ghi sổ dùng idempotency key.
- Quantity là số nguyên thùng/két/keg. Chai/lon chỉ là dữ liệu quy đổi báo cáo.
- Chỉ trạng thái `POSTED` được tạo movement và thay đổi balance.

Xem [Architecture Gate](docs/architecture/phase-2-gate.md) trước khi bắt đầu Phase 3.
