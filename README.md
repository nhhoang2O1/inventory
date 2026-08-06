# Warehouse WMS

Architecture foundation cho hệ thống quản lý kho bán sỉ bia và nước ngọt. Kho chỉ quản lý nguyên kiện thùng/két/keg; không xé lẻ chai/lon/lốc.

## Yêu cầu

- Node.js 22.12–22.x; baseline container: 22.23.1 LTS.
- npm 10.x.
- Docker Desktop với Docker Compose v2.

## Hướng Dẫn Chạy Chương Trình

### 1. Khởi tạo môi trường & Cơ sở dữ liệu

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run db:migrate
```

### 2. Chạy Backend HTTP API (NestJS - Port 3000)

```powershell
npm run dev:api
```
- API Health Check: `GET http://localhost:3000/api/v1/health`
- PostgreSQL publish ở `localhost:55432` (tránh trùng cổng 5432).

### 3. Chạy AI Nhận Diện Biển Số Xe 2-Stage YOLO (Python Microservice - Port 8000)

```powershell
python scripts/ocr_service.py
```
- Dịch vụ AI OCR chạy ở `http://localhost:8000/scan-license-plate`.
- Tự động nạp mô hình pre-trained YOLOv5 Nano (`LP_detector_nano_61.pt` & `LP_ocr_nano_62.pt`) nhận diện biển số và từng ký tự biển số xe Việt Nam.

### 4. Chạy Frontend Web App (React Vite - Port 5173)

```powershell
npm run dev:web
```
- Mở trình duyệt truy cập: `http://localhost:5173`

### 5. (Tùy chọn) Chạy Background Worker

```powershell
npm run dev:worker
```

### 6. Chạy bằng Docker Compose (Full Stack)

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
