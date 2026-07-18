# YÊU CẦU KỸ THUẬT PROJECT QUẢN LÝ KHO BIA – NƯỚC NGỌT

## Technical Requirements Specification

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 – Draft |
| Requirement nghiệp vụ nguồn | Requirement quản lý kho bia – nước ngọt v3.1 |
| Kế hoạch nguồn | Kế hoạch 10 phase và kế hoạch ba người làm song song v3.1 |
| Đối tượng đọc | Tech Lead, Developer, QA, DevOps, DBA, BA và Product Owner |
| Mục đích | Chốt yêu cầu kỹ thuật trước khi thiết kế chi tiết, tạo repository và coding production |
| Trạng thái | Baseline đề xuất – cần duyệt tại Phase 1/2 |

> Các mục ghi “Đề xuất” là lựa chọn kỹ thuật phù hợp với đội ba người, chưa phải quyết định chính thức nếu stakeholder hoặc hạ tầng doanh nghiệp chưa phê duyệt.

---

# 1. Mục tiêu kỹ thuật

Hệ thống phải:

1. Bảo đảm tính đúng của On-hand, Reservation, ATP, Inventory Movement Ledger và Inventory Balance trong mọi giao dịch đồng thời.
2. Không cho module nghiệp vụ cập nhật trực tiếp số dư tồn.
3. Hỗ trợ nhập, xuất, chuyển, kiểm kê, trả hàng, recall và reversal bằng transaction có truy vết.
4. Vận hành được với đội phát triển ba người mà không tạo chi phí quản trị microservices quá sớm.
5. Có API contract rõ, test automation, audit, observability, migration và rollback/cutover ngay từ đầu.
6. Có khả năng mở rộng thành nhiều process/service sau này mà không phải viết lại domain lõi.

## 1.1. Ngoài mục tiêu MVP

- Không xây microservices độc lập cho từng module trong MVP.
- Không yêu cầu Kubernetes nếu chưa có hạ tầng và SLA tương ứng.
- Không dùng event sourcing thuần túy làm mô hình lưu trữ duy nhất; Ledger là nguồn truy vết, Balance là projection nhất quán.
- Không xây data warehouse/BI platform hoàn chỉnh trong MVP.
- Không hỗ trợ offline-first cho đến khi D-110 được chốt.
- Không dùng Redis, search engine hoặc message broker làm nguồn sự thật của tồn kho.

---

# 2. Stack kỹ thuật đề xuất

| Lớp | Baseline đề xuất | Yêu cầu bắt buộc |
|---|---|---|
| Frontend | React + TypeScript, responsive web/PWA-ready | Type-safe, barcode-friendly, accessibility và không tự tính ATP |
| Backend | NestJS + TypeScript theo modular monolith | Module boundary rõ, dependency injection, validation và transaction rõ ràng |
| Worker | Process riêng dùng chung codebase backend | Đọc outbox/job, retry idempotent, không thay đổi tồn ngoài Posting Service |
| Database | PostgreSQL relational database | ACID transaction, row locking, unique/check constraint, point-in-time recovery khi hạ tầng hỗ trợ |
| Data access | ORM/query builder được phê duyệt tại T-003 | Phải hỗ trợ explicit transaction, optimistic version và row-level locking; cho phép SQL tối ưu khi cần |
| API | REST JSON, OpenAPI, `/api/v1` | Versioned contract, correlation ID, idempotency và error schema chuẩn |
| File storage | S3-compatible object storage hoặc dịch vụ tương đương | Private bucket, signed access, malware scan và retention policy |
| Async | Transactional Outbox + Worker | Không mất sự kiện sau POSTED; retry/dead-letter/reconciliation |
| Cache | Không bắt buộc; Redis chỉ thêm sau đo tải | Cache không được là nguồn sự thật của balance/reservation |
| Container | Docker | Image bất biến, chạy non-root, health check và cấu hình qua environment/secret store |
| Local development | Docker Compose hoặc công cụ tương đương | Một lệnh dựng database, object storage giả lập và các service cần thiết |

## 2.1. Quy tắc chọn phiên bản

- Chọn runtime/framework thuộc nhánh được duy trì tại thời điểm Phase 2.
- Pin phiên bản bằng lockfile; không dùng wildcard cho dependency production.
- Nâng dependency phải qua CI, integration test và dependency/security scan.
- Không tự động nâng major version trên production branch.

---

# 3. Kiến trúc tổng thể

Kiến trúc MVP là **modular monolith có worker riêng**, dùng một relational database nhưng phân tách module/schema logic rõ ràng.

~~~mermaid
flowchart LR
    U[Web/Handheld Browser] --> W[React Web App]
    W -->|HTTPS REST /api/v1| API[NestJS Modular Monolith]

    API --> IAM[IAM & Approval]
    API --> CAT[Catalog & Warehouse]
    API --> INV[Inventory Core]
    API --> OPS[Inbound/Outbound/Transfer]
    API --> QR[Quality & Recall]
    API --> REP[Planning & Reporting]

    IAM --> DB[(PostgreSQL)]
    CAT --> DB
    INV --> DB
    OPS -->|Posting commands| INV
    QR -->|Posting commands| INV
    REP -->|Read model/query| DB

    API --> OBJ[(Object Storage)]
    DB --> OUT[Outbox]
    OUT --> WORKER[Background Worker]
    WORKER --> EXT[POS/ERP/Kế toán/Notification]
    WORKER --> DB
~~~

## 3.1. Quy tắc kiến trúc

| ID | Yêu cầu |
|---|---|
| TR-ARCH-001 | Inventory Core là module duy nhất sở hữu InventoryBalance, InventoryReservation và InventoryMovementLedger. |
| TR-ARCH-002 | Module khác thay đổi tồn qua application command/Posting Service; không import repository hoặc ghi bảng Inventory trực tiếp. |
| TR-ARCH-003 | Module có thể đọc dữ liệu module khác qua public interface/query contract; không phụ thuộc ngược vào implementation nội bộ. |
| TR-ARCH-004 | Mọi giao dịch POSTED phải hoàn tất document state, movement, balance, reservation fulfillment, audit cần thiết và outbox trong transaction nhất quán. |
| TR-ARCH-005 | Tích hợp hệ thống ngoài chạy bất đồng bộ sau commit, trừ API tra cứu hoặc bước được xác nhận bắt buộc đồng bộ. |
| TR-ARCH-006 | Reporting không được giữ lock dài hoặc chạy truy vấn làm suy giảm luồng POSTED; báo cáo nặng chạy async/read model. |
| TR-ARCH-007 | Mọi quyết định kỹ thuật ảnh hưởng transaction, data model, security hoặc deployment phải có ADR. |
| TR-ARCH-008 | Không tách microservice trước khi có dữ liệu đo về tải, ownership hoặc nhu cầu scale độc lập. |

---

# 4. Module và ranh giới sở hữu

| Module | Trách nhiệm | Không được làm |
|---|---|---|
| IAM | User, Role, Permission, Warehouse Scope, session | Sửa document/inventory trực tiếp |
| Approval | ApprovalPolicy, request, decision, delegation | Tự POST chứng từ ngoài command được cấp |
| Catalog | Product, SKU, Barcode | Lưu số dư tồn trên Product/SKU |
| Warehouse | Warehouse, Zone, Location, Capacity, MixingPolicy | Tự chuyển tồn khi đổi location master |
| Inventory Core | Batch, Balance, Reservation, Movement, Posting, ATP | Nhúng quy trình PO/Sales/Return cụ thể |
| Purchasing | Supplier, PR, PO, DeliverySchedule | Tăng tồn khi PO được duyệt |
| Receiving | GoodsReceipt, inspection đầu vào, put-away | Ghi balance ngoài Posting Service |
| Outbound | Issue Request, allocation, FEFO, PickTask, GoodsIssue | Tự tính ATP bằng công thức riêng |
| Transfer | StockTransfer và IN_TRANSIT | Xóa movement nguồn khi nhận đích |
| Stocktake | Count, reconciliation, adjustment request | Thay đổi tồn trước Adjustment POSTED |
| Quality | QualityCase, QC, disposition, destruction | Chuyển trạng thái không tạo movement |
| Recall | RecallCase, scope, containment, forward trace | Cho lô ACTIVE recall trở thành ATP |
| Container | ContainerMovement, balance by party, deposit reference | Ghi tiền cọc thành doanh thu trực tiếp |
| Planning | ROP, SafetyStock, Draft PR | Tự tạo PO APPROVED |
| Reporting | Dashboard, export, drill-down | Cập nhật giao dịch nguồn |
| Integration | Outbox consumer, mapping, retry, reconciliation | Ghi trùng hoặc bỏ qua idempotency |
| Audit | AuditEvent append-only, query theo quyền | Cho application role UPDATE/DELETE audit |

---

# 5. Yêu cầu Frontend

| ID | Yêu cầu |
|---|---|
| TR-FE-001 | Web app responsive, sử dụng tốt trên desktop, tablet và thiết bị quét có trình duyệt. |
| TR-FE-002 | Các màn Receiving, Picking, Transfer và Stocktake ưu tiên scan, focus tự động và hạn chế nhập tay. |
| TR-FE-003 | Frontend không tự cập nhật optimistic balance như nguồn sự thật; luôn dùng kết quả command/query từ server. |
| TR-FE-004 | Frontend không tự tính ATP, FEFO, MRSL hoặc giá vốn; chỉ hiển thị kết quả và explanation từ backend. |
| TR-FE-005 | Mọi action nhạy cảm hiển thị trạng thái, permission error, conflict/version error và cách khắc phục rõ ràng. |
| TR-FE-006 | Form phải có client validation để hỗ trợ UX nhưng server vẫn là nơi validation cuối cùng. |
| TR-FE-007 | API client gửi correlation ID và idempotency key cho command phù hợp; không tự retry POST không idempotent. |
| TR-FE-008 | Permission được dùng để ẩn/disable UI nhưng backend vẫn kiểm tra quyền độc lập. |
| TR-FE-009 | Màn danh sách hỗ trợ pagination/filter/sort phía server; không tải toàn bộ ledger/report lớn vào trình duyệt. |
| TR-FE-010 | Export lớn tạo job bất đồng bộ và cung cấp trạng thái hoàn thành, không giữ request HTTP dài. |
| TR-FE-011 | Lưu timezone hiển thị theo doanh nghiệp; timestamp từ API là UTC/ISO-8601 có timezone. |
| TR-FE-012 | Offline mode chỉ được triển khai sau ADR riêng; không cache command tồn để đồng bộ ngầm khi chưa có thiết kế conflict. |

## 5.1. Trạng thái UI chuẩn

- Loading/skeleton.
- Empty state.
- Validation error.
- Forbidden/warehouse scope error.
- Version conflict/concurrent modification.
- Business rule rejection.
- Pending approval.
- POSTED immutable.
- Integration pending/failed.
- Background job pending/completed/failed.

---

# 6. Yêu cầu Backend

| ID | Yêu cầu |
|---|---|
| TR-BE-001 | Sử dụng các lớp domain/application/infrastructure hoặc cấu trúc tương đương; controller không chứa nghiệp vụ lõi. |
| TR-BE-002 | Command thay đổi trạng thái phải kiểm tra actor, warehouse scope, permission, current state, version và business policy. |
| TR-BE-003 | Mọi POSTED command chạy trong transaction database rõ ràng và có timeout hợp lý. |
| TR-BE-004 | Validation sử dụng canonical UOM, integer base quantity và policy có thời gian hiệu lực. |
| TR-BE-005 | Không sử dụng floating point cho quantity, money, conversion hoặc percentage nghiệp vụ. |
| TR-BE-006 | Service tạo ID phía server; ID không được suy luận chứa dữ liệu nhạy cảm hoặc phụ thuộc sequence hiển thị. |
| TR-BE-007 | Command phải hỗ trợ idempotency theo caller + operation + key; cùng key/payload trả lại kết quả cũ, cùng key khác payload bị từ chối. |
| TR-BE-008 | Optimistic version hoặc row lock phải được áp dụng tại aggregate/balance bị cạnh tranh. |
| TR-BE-009 | Error dùng mã ổn định; không trả stack trace, SQL hoặc secret cho client. |
| TR-BE-010 | Job/consumer phải idempotent, có retry policy, dead-letter và trạng thái xử lý. |
| TR-BE-011 | Log phải có correlation ID, request ID, actor ID, module và outcome; không log password/token hoặc payload nhạy cảm. |
| TR-BE-012 | Feature P1/P2 chưa sẵn sàng phải dùng feature flag/config, không để code dở tác động luồng P0. |

---

# 7. Mô hình dữ liệu và database

## 7.1. Quy tắc kiểu dữ liệu

| Dữ liệu | Quy tắc |
|---|---|
| ID | UUID hoặc chiến lược ID thống nhất; không tái sử dụng ID đã xóa |
| Số lượng tồn | Integer/bigint theo đơn vị cơ sở |
| Hệ số quy đổi | Decimal có precision/scale được chốt; snapshot trên dòng chứng từ |
| Tiền | Decimal, có currency; không dùng float/double |
| Phần trăm | Decimal, định nghĩa rõ 0–1 hay 0–100 tại contract |
| Timestamp | Lưu UTC bằng kiểu có timezone; hiển thị theo timezone doanh nghiệp |
| Business date | Date riêng khi quy tắc dựa theo ngày kho/kế toán |
| Mã nghiệp vụ | Normalized, unique theo phạm vi và case-sensitivity được chốt |
| JSON | Chỉ dùng cho metadata/snapshot có schema; không thay bảng quan hệ lõi bằng JSON tùy ý |

## 7.2. Bảng lõi tối thiểu

- `product`, `sku`, `barcode`.
- `warehouse`, `zone`, `location`, `capacity_rule`, `location_mixing_policy`.
- `batch`, `inventory_balance`, `inventory_reservation`, `inventory_movement_ledger`.
- `inventory_cost_ledger`, `idempotency_record`, `outbox_event`.
- Các header/line của PR, PO, Goods Receipt, Goods Issue, Transfer, Stocktake, Adjustment, Return và Recall.
- `user`, `role`, `permission`, `user_warehouse_scope`, `approval_policy`, `approval_event`.
- `audit_event`, `integration_event`, `attachment`.

## 7.3. Constraint bắt buộc

| ID | Constraint |
|---|---|
| TR-DB-001 | `inventory_balance` unique theo SKU + Batch + Warehouse + Location + StockStatus. |
| TR-DB-002 | StockStatus không có `RESERVED`; reservation là bảng/aggregate riêng. |
| TR-DB-003 | `quantity_on_hand >= 0`; số dư và movement sử dụng base quantity integer. |
| TR-DB-004 | Barcode đang hiệu lực unique theo quy tắc nghiệp vụ được duyệt. |
| TR-DB-005 | Mỗi SKU thuộc đúng một Product; giao dịch và balance tham chiếu SKU. |
| TR-DB-006 | Movement/Audit không bị UPDATE/DELETE qua application database role. |
| TR-DB-007 | Idempotency record unique theo caller + operation + key. |
| TR-DB-008 | Document line lưu snapshot conversion, policy/cost reference và dữ liệu cần tái hiện lịch sử. |
| TR-DB-009 | MFG < EXP khi cả hai có giá trị; yêu cầu bắt buộc ngày theo SKU policy. |
| TR-DB-010 | Foreign key và index phải bao phủ các đường query/posting chính; không bỏ FK chỉ để tăng tốc trước khi đo. |

## 7.4. Migration database

- Mọi schema change có migration được version hóa trong repository.
- Production áp dụng mô hình expand → migrate/backfill → switch → contract khi thay đổi không tương thích.
- Không rename/drop cột đang được phiên bản ứng dụng hiện hành sử dụng trong cùng release.
- Migration dữ liệu lớn phải chạy theo batch, có checkpoint, progress và khả năng chạy lại idempotent.
- Backup/restore hoặc rollback plan phải được ghi trong release note cho migration rủi ro cao.

---

# 8. Inventory Core và transaction invariant

## 8.1. Mô hình canonical

$$\text{Warehouse On-hand} = \sum(\text{AVAILABLE, QUARANTINED, DAMAGED, EXPIRED, BLOCKED, RECALLED})$$

$$\text{Sellable On-hand} = \sum(\text{AVAILABLE})$$

$$\text{ATP} = \text{Sellable On-hand} - \text{Active Reservation}$$

$$\text{Enterprise-owned Inventory} = \sum(\text{Warehouse On-hand}) + \sum(\text{IN_TRANSIT})$$

## 8.2. Invariant bắt buộc

| ID | Invariant |
|---|---|
| TR-INV-001 | On-hand và ATP sau transaction không âm. |
| TR-INV-002 | Tổng Active Reservation không vượt Sellable On-hand trong cùng allocation scope. |
| TR-INV-003 | Tạo/release/expire reservation không tạo Inventory Movement. |
| TR-INV-004 | Goods Issue POSTED mới giảm On-hand và fulfillment reservation trong cùng transaction. |
| TR-INV-005 | Mọi balance delta có movement tương ứng và reconciliation khớp. |
| TR-INV-006 | Confirm/Approve không đổi tồn; chỉ POSTED tạo movement/balance. |
| TR-INV-007 | Reversal tạo movement ngược và không sửa/xóa movement/chứng từ gốc. |
| TR-INV-008 | `IN_TRANSIT` không thuộc ATP kho nguồn/đích nhưng vẫn thuộc Enterprise-owned Inventory. |
| TR-INV-009 | EXPIRED/BLOCKED/QUARANTINED/DAMAGED/RECALLED không allocation/pick/post bán được. |
| TR-INV-010 | Movement containment/disposition có quyền được phép nhưng phải giữ trạng thái bị hạn chế cho đến transition hợp lệ. |
| TR-INV-011 | Posting nhiều dòng là atomic: thành công toàn bộ hoặc rollback toàn bộ. |
| TR-INV-012 | Retry command/consumer không tạo chứng từ, movement, reservation hoặc outbox trùng. |

## 8.3. Trình tự Posting Service

1. Xác thực actor/session và warehouse scope.
2. Kiểm tra document state, approval và optimistic version.
3. Kiểm tra idempotency key/payload hash.
4. Resolve UOM conversion, business date và policy có hiệu lực.
5. Lock balance/reservation rows theo thứ tự canonical để giảm deadlock.
6. Kiểm tra ATP/status/MRSL/capacity/mixing và các invariant liên quan.
7. Tạo Inventory Movement Ledger.
8. Cập nhật Inventory Balance và reservation fulfillment nếu áp dụng.
9. Chuyển document sang POSTED và lưu audit/approval reference.
10. Ghi Outbox Event trong cùng transaction.
11. Commit và trả kết quả ổn định cho idempotency key.

---

# 9. API và contract

## 9.1. Quy ước HTTP

| ID | Yêu cầu |
|---|---|
| TR-API-001 | Base path `/api/v1`; breaking change cần version mới hoặc compatibility plan. |
| TR-API-002 | OpenAPI được sinh/duy trì trong CI và dùng làm contract cho frontend/integration. |
| TR-API-003 | JSON dùng naming convention thống nhất; timestamp ISO-8601 có timezone. |
| TR-API-004 | Command idempotent nhận `Idempotency-Key`; mọi request nhận/trả `Correlation-Id`. |
| TR-API-005 | List API dùng pagination có giới hạn, filter/sort allowlist và stable ordering. |
| TR-API-006 | Không cung cấp generic CRUD cho Inventory Balance, Ledger, Audit hoặc document POSTED. |
| TR-API-007 | State transition dùng endpoint/command rõ, ví dụ submit/approve/post/reverse, không sửa state bằng PATCH tùy ý. |
| TR-API-008 | Conflict version/ATP trả HTTP status và error code ổn định để client xử lý. |
| TR-API-009 | File export lớn trả job ID; client poll hoặc nhận thông báo trạng thái. |
| TR-API-010 | API chứa dữ liệu giá, cost, contact hoặc audit phải enforce permission/warehouse scope phía server. |

## 9.2. Error schema tối thiểu

```json
{
  "code": "INVENTORY_ATP_INSUFFICIENT",
  "message": "Không đủ ATP để giữ hàng",
  "correlationId": "...",
  "details": {
    "skuId": "...",
    "requested": 60,
    "availableToPromise": 40
  }
}
```

`details` không được chứa SQL, stack trace, token, password hoặc dữ liệu ngoài quyền người gọi.

---

# 10. Async job và tích hợp

| ID | Yêu cầu |
|---|---|
| TR-ASYNC-001 | Outbox Event được ghi cùng transaction nghiệp vụ và chỉ publish sau commit. |
| TR-ASYNC-002 | Worker claim event an toàn khi nhiều instance; consumer xử lý ít nhất một lần nhưng kết quả nghiệp vụ idempotent. |
| TR-ASYNC-003 | Retry dùng backoff/jitter và giới hạn; lỗi vượt ngưỡng chuyển dead-letter/error state. |
| TR-ASYNC-004 | Mỗi event có event ID, type, schema version, aggregate ID, occurredAt và correlation ID. |
| TR-ASYNC-005 | Không gửi dữ liệu nhạy cảm không cần thiết trong event. |
| TR-ASYNC-006 | Có màn hình/report đối soát integration pending/failed, số lần retry và thao tác replay có audit. |
| TR-ASYNC-007 | Scheduled job như expiry, reservation timeout, ROP và export phải chống chạy trùng. |
| TR-ASYNC-008 | Job không cập nhật balance trực tiếp; mọi tác động tồn gọi canonical command/Posting Service. |

---

# 11. Bảo mật

## 11.1. Authentication và session

- Ưu tiên OIDC/OAuth2 nếu doanh nghiệp có identity provider; nếu local authentication, password phải băm bằng thuật toán thích hợp như Argon2id/bcrypt có salt.
- Access token/session phải ngắn hạn và cấu hình được; refresh token cần rotation/revocation nếu sử dụng.
- MFA bắt buộc cho admin và người duyệt giao dịch nhạy cảm theo Requirement v3.1.
- Khóa/rate-limit đăng nhập thất bại và có audit đăng nhập.
- Không sử dụng tài khoản dùng chung ở production.

## 11.2. Authorization

- RBAC kết hợp Warehouse/Branch Scope.
- Backend kiểm tra permission trên từng command/query; không tin role do frontend gửi.
- Người tạo không tự duyệt khi ApprovalPolicy yêu cầu four-eyes.
- Quyền override FEFO/MRSL/capacity, adjustment, destroy, recall và xem giá phải tách riêng.
- Database production dùng least-privilege roles; application role không có quyền ALTER/DROP hoặc sửa Audit/Ledger lịch sử.

## 11.3. Application và infrastructure security

| ID | Yêu cầu |
|---|---|
| TR-SEC-001 | TLS cho toàn bộ traffic ngoài process/host theo hạ tầng đã duyệt. |
| TR-SEC-002 | Secret lưu trong secret manager/environment bảo vệ; không commit vào Git hoặc image. |
| TR-SEC-003 | CORS allowlist, security header, request size limit và rate limit cho endpoint nhạy cảm. |
| TR-SEC-004 | Validation/sanitization server-side; query parameterized, không nối chuỗi SQL từ input. |
| TR-SEC-005 | File attachment giới hạn loại/kích thước, quét malware và lưu private. |
| TR-SEC-006 | Không log token, password, secret, raw payment/PII không cần thiết. |
| TR-SEC-007 | Dependency, secret và container scan chạy trong CI; Sev/Critical chưa xử lý chặn release theo policy. |
| TR-SEC-008 | Backup và dữ liệu nhạy cảm at-rest được mã hóa theo khả năng hạ tầng. |
| TR-SEC-009 | Break-glass infrastructure access phải có phê duyệt, thời hạn, log và review sau sử dụng. |
| TR-SEC-010 | Security test bao gồm authorization negative cases cho UI và API trực tiếp. |

---

# 12. Hiệu năng, tải và khả năng mở rộng

## 12.1. Ngưỡng requirement

| Hoạt động | Mục tiêu |
|---|---:|
| Tìm SKU/barcode/lô | p95 ≤ 2 giây |
| Màn hình tồn với filter thông thường | p95 ≤ 3 giây |
| POSTED chứng từ | p95 ≤ 5 giây, không tính integration async |
| Báo cáo nặng | Chạy async, không khóa nhập/xuất |

## 12.2. Test profile tạm thời – cần xác nhận

Đến khi D-107/D-108 được duyệt, QA dùng baseline đề xuất sau để thiết kế test, không xem đây là cam kết kinh doanh:

- 20.000 SKU hoạt động.
- 10 kho/chi nhánh.
- 5 triệu dòng Inventory Movement.
- 50 người dùng đồng thời.
- 10.000 dòng chứng từ POSTED/ngày.
- Burst 50 API request/giây trong các đợt thao tác cao điểm.

## 12.3. Yêu cầu scale

- API phải stateless ngoài database/object storage để có thể chạy nhiều instance.
- Worker có thể scale theo queue/outbox backlog nhưng phải claim job an toàn.
- Index phải dựa trên query plan và số liệu đo; theo dõi slow query/deadlock.
- Ledger lớn có chiến lược archive/partition chỉ sau benchmark và ADR; không partition sớm theo phỏng đoán.
- Cache read-only phải có invalidation rõ và không được dùng để phán quyết ATP cuối cùng.

---

# 13. Audit và observability

## 13.1. Audit Event

Audit tối thiểu gồm:

- Actor/user/service.
- Effective role và warehouse scope.
- Action/event type.
- Aggregate/document ID.
- Timestamp UTC và business date khi áp dụng.
- IP/device/session/request/correlation ID.
- Before/after hoặc field-level diff phù hợp.
- Reason, approval reference và override flag.
- Outcome success/rejected/failed.

Audit là append-only đối với application role; thời hạn lưu theo D-108, đề xuất tối thiểu 5 năm.

## 13.2. Log, metric và alert

Phải quan sát được:

- API latency/error rate theo endpoint/module.
- Posting success/failure/conflict/deadlock.
- ATP/reservation rejection và expiry job.
- Ledger–Balance reconciliation mismatch.
- Database connection, CPU/storage, slow query và deadlock.
- Outbox backlog, retry, dead-letter và integration failure.
- Scheduled job failure và thời gian chạy.
- Login/MFA/authorization failure bất thường.
- Backup/restore status và dung lượng object storage.
- Recall activation/containment failure.

Mọi alert phải có owner, severity, threshold và runbook; không tạo alert không có hành động xử lý.

---

# 14. Môi trường và triển khai

| Môi trường | Mục đích | Dữ liệu |
|---|---|---|
| Local | Phát triển cá nhân | Seed/fake data |
| Test/CI | Unit, integration, contract | Tạo mới theo pipeline |
| Staging/UAT | E2E, UAT, performance có kiểm soát | Dữ liệu ẩn danh hoặc synthetic gần production |
| Production | Vận hành thật | Dữ liệu thật, quyền hạn chế |

## 14.1. Deployment requirements

- Build image một lần và promote cùng artifact qua môi trường.
- Cấu hình/secret tách khỏi image.
- Container chạy non-root khi khả thi, có liveness/readiness/health check.
- Database migration là bước có kiểm soát, không tự chạy không giám sát khi migration rủi ro cao.
- Production deploy cần approval, release note, migration plan, smoke test và rollback/forward-fix plan.
- Feature flag dùng cho tính năng chưa hoàn thành; không dùng flag để che migration không tương thích.
- Nếu SLA yêu cầu high availability, chạy nhiều API instance và database/service tương ứng; cấu hình cuối chốt tại T-001/T-010.

---

# 15. CI/CD và quản lý source code

## 15.1. Pipeline tối thiểu

1. Cài dependency từ lockfile.
2. Format/lint/type-check.
3. Unit test.
4. Integration test với PostgreSQL thật trong CI.
5. Kiểm tra migration trên database mới và database phiên bản trước.
6. Sinh/validate OpenAPI và phát hiện breaking contract.
7. Secret/dependency/static security scan.
8. Build frontend/backend/worker và Docker image.
9. Deploy test/staging.
10. Contract/E2E/smoke test.
11. Manual approval cho production.
12. Production smoke test và monitoring window.

## 15.2. Git và review

- Nhánh ngắn, tích hợp thường xuyên; không để feature branch kéo dài nhiều tuần.
- Pull request bắt buộc có ticket/FR, mô tả thay đổi, test evidence và migration impact.
- Không tự approve pull request của mình.
- Thay đổi Inventory Core, auth, migration hoặc security cần review của ít nhất hai người trong đội ba người.
- Protected main branch; CI bắt buộc pass trước merge.
- Commit/tag/release phải truy vết được về artifact đã deploy.

---

# 16. Chiến lược kiểm thử

| Loại test | Phạm vi bắt buộc |
|---|---|
| Unit | Formula, validation, state transition, MRSL, FEFO, UOM, Supplier KPI |
| Property-based | Ledger–Balance, ATP, conversion integer, reversal và idempotency invariant |
| Integration | Transaction, locking, repository, outbox, object storage và database constraint |
| Contract | Frontend–API và POS/ERP/kế toán |
| E2E | Nhập, giữ, xuất, chuyển, kiểm kê, return, recall và reversal |
| Concurrency | Reservation/POSTED đồng thời, lock ordering, deadlock/retry |
| Performance | Search, inventory screen, POSTED, report và async job |
| Security | Authentication, RBAC/scope, approval separation, file và API negative cases |
| Migration | Dry-run, idempotent rerun, reject report, quantity/value reconciliation |
| Recovery | Backup/restore, RPO/RTO và reconciliation sau restore |
| UAT | UAT-01 đến UAT-16 trong Requirement v3.1 |

## 16.1. Quality gate

- 100% test P0 pass.
- Không còn Sev 1/Sev 2 chưa xử lý.
- Critical domain invariant phải có automated test; không dùng coverage cao để thay thế scenario đúng.
- Mục tiêu đề xuất cho domain Inventory Core: branch coverage ≥ 85%, nhưng gate cuối dựa trên invariant và mutation/property/concurrency evidence.
- Không merge code làm thay đổi tồn nếu thiếu integration test transaction/idempotency phù hợp.
- Không go-live nếu ledger/balance, migration quantity hoặc restore reconciliation không đạt 100% trên phạm vi kiểm thử.

---

# 17. Migration dữ liệu

## 17.1. Nguồn dữ liệu cần hỗ trợ

- Product/SKU/UOM/Packaging/Barcode.
- Warehouse/Zone/Location/Capacity.
- Supplier/Customer reference.
- Batch/MFG/EXP/Receiving Date/StockStatus.
- Opening On-hand theo SKU + Batch + Warehouse + Location + Status.
- PO/reservation/issue request đang mở nếu được quyết định migrate.
- Container/deposit balance và opening cost nếu áp dụng.

## 17.2. Yêu cầu migration

| ID | Yêu cầu |
|---|---|
| TR-MIG-001 | Staging/import table tách dữ liệu nguồn khỏi bảng production. |
| TR-MIG-002 | Import có schema validation, duplicate detection, reject code và downloadable report. |
| TR-MIG-003 | Mapping ID/mã nguồn được lưu để chạy lại và đối soát. |
| TR-MIG-004 | Opening Balance tạo qua document/movement chuẩn, không INSERT thẳng balance mà thiếu ledger. |
| TR-MIG-005 | Script chạy lại idempotent và có batch/checkpoint. |
| TR-MIG-006 | Ít nhất hai dry-run với dữ liệu gần production trước cutover. |
| TR-MIG-007 | Đối soát record count, base quantity, batch/location/status và value. |
| TR-MIG-008 | Dữ liệu source không được tự sửa nếu thiếu business approval. |

---

# 18. Backup, khôi phục và continuity

- RPO đề xuất ≤ 15 phút, RTO đề xuất ≤ 4 giờ; chốt tại D-108/T-012.
- Full backup và transaction/incremental backup theo khả năng nền tảng.
- Có bản sao ngoài failure domain chính và mã hóa phù hợp.
- Restore rehearsal tối thiểu mỗi quý hoặc trước major release rủi ro cao.
- Sau restore phải chạy Ledger–Balance, Outbox và quantity/value reconciliation.
- Runbook phải ghi owner, quyền truy cập, trình tự restore, rotate secret, DNS/traffic switch và communication.
- Kết quả restore test phải có biên bản/evidence, không chỉ kiểm tra backup job “thành công”.

---

# 19. Cấu trúc repository đề xuất

```text
warehouse-management/
├─ apps/
│  ├─ api/                 # HTTP API / modular monolith
│  ├─ worker/              # outbox, scheduled jobs, export
│  └─ web/                 # React application
├─ packages/
│  ├─ contracts/           # shared API/event schemas generated or type-safe
│  ├─ domain-testing/      # fixtures/builders/property generators
│  ├─ eslint-config/
│  └─ tsconfig/
├─ database/
│  ├─ migrations/
│  ├─ seeds/
│  └─ scripts/
├─ docs/
│  ├─ adr/
│  ├─ api/
│  ├─ runbooks/
│  └─ diagrams/
├─ deploy/
│  ├─ local/
│  ├─ staging/
│  └─ production/
└─ tests/
   ├─ contract/
   ├─ e2e/
   ├─ performance/
   └─ security/
```

## 19.1. Dependency direction

- Domain không import framework, HTTP hoặc database implementation nếu có thể tránh.
- Application layer điều phối use case/transaction.
- Infrastructure hiện thực repository, storage, queue và external client.
- Web/API/worker là delivery mechanism, không sở hữu business invariant.
- Shared package chỉ chứa contract/thành phần thật sự dùng chung; không tạo “common” package thành nơi chứa mọi thứ.

---

# 20. Technical gates

## Gate A – Architecture Ready

- Stack và ADR kiến trúc được duyệt.
- Repository/CI/CD/local environment hoạt động.
- OpenAPI/error/idempotency/audit convention được chốt.
- ERD/module boundaries/threat model có review.

## Gate B – Master Data Ready

- Product 1:N SKU, UOM, Barcode, Warehouse/Location và IAM hoạt động.
- RBAC/warehouse scope negative test pass.
- Import template và audit master data hoạt động.

## Gate C – Inventory Core Ready

- TR-INV-001 đến TR-INV-012 pass bằng automated test.
- Posting Service, Reservation, ATP, Idempotency và Reconciliation ổn định.
- Không StockStatus `RESERVED`.
- Concurrency test không oversell/tồn âm.
- API contract freeze cho Phase 5–7.

## Gate D – Operations Ready

- Inbound, Outbound, Transfer và Stocktake chạy E2E.
- UAT-01/02/03/05/06/08/09/15 pass.
- Không Sev 1/2 về ledger, ATP, permission hoặc idempotency.

## Gate E – Production Ready

- UAT-01 đến UAT-16 và NFR được ký.
- Migration rehearsal, security/performance và backup/restore pass.
- Monitoring, runbook, on-call, cutover và rollback sẵn sàng.
- Không Sev 1/2 mở.

---

# 21. Traceability kỹ thuật

| Requirement | Module/yêu cầu kỹ thuật chính | Gate |
|---|---|---|
| FR-01, FR-02 | Catalog, Warehouse, TR-DB-004/005 | B |
| FR-03, FR-04 | Purchasing, Receiving, Posting, MRSL | D |
| FR-05, FR-06 | Inventory Core, TR-INV-001…012 | C |
| FR-07 | Reservation, ATP, FEFO, Outbound | D |
| FR-08, FR-11 | Transfer, IN_TRANSIT, Stocktake, Reversal | D |
| FR-09, FR-10 | Container, Quality, Return, Disposition | E |
| FR-12…FR-15 | Planning, Cost, Reporting | E |
| FR-16 | IAM, Approval, Audit, TR-SEC | A/B/E |
| FR-17 | Outbox, Worker, Integration, TR-ASYNC | E |
| FR-18 | Recall, containment, forward trace, TR-INV-009/010 | E |
| FR-19 | Supplier KPI và data-quality rules | E |
| NFR-01…09 | Performance, concurrency, security, audit, backup, operations | A/C/E |

---

# 22. Phân công kỹ thuật cho đội ba người

| Hạng mục | Owner chính | Reviewer/consumer |
|---|---|---|
| Architecture, DB, Posting Service | Người A | B và C |
| Frontend, Reservation consumer, Outbound | Người B | A và C |
| IAM, CI/CD, Reconciliation, Integration | Người C | A và B |
| Inventory Core ADR/contract | A + B | C kiểm thử integrity |
| Security/migration/go-live | C điều phối | A và B cùng chịu trách nhiệm |

Thay đổi Inventory Core, authentication, production migration hoặc authorization cần review của hai người còn lại.

---

# 23. Quyết định kỹ thuật cần chốt

| ID | Quyết định | Hạn chốt |
|---|---|---|
| T-001 | Cloud, on-premise hay hybrid; production topology và SLA? | Phase 1 |
| T-002 | OIDC provider hay local authentication? | Phase 1/2 |
| T-003 | ORM/query builder và cơ chế row locking cụ thể? | Phase 2 |
| T-004 | Có cần offline mode/handheld native không? | Phase 1 |
| T-005 | PostgreSQL outbox worker đủ hay cần Redis/message broker? | Sau benchmark Phase 4 |
| T-006 | Object storage và malware scanning solution? | Phase 2 |
| T-007 | POS/ERP/kế toán nào tích hợp, protocol và system of record? | Phase 1 |
| T-008 | Công nghệ report/export và nhu cầu BI? | Trước Phase 9 |
| T-009 | Logging/metrics/tracing stack và retention? | Phase 2 |
| T-010 | Quy mô dữ liệu, concurrent users và availability target? | Phase 1 |
| T-011 | Loại barcode/QR, scanner, printer và browser/device support matrix? | Phase 1 |
| T-012 | RPO, RTO, audit/file retention và backup provider? | Phase 1/2 |

Không quyết định T-001…T-012 bằng suy đoán trong code. Mọi giá trị tạm thời phải nằm trong config/ADR và có owner xác nhận.

---

# 24. Definition of Ready kỹ thuật

Một story sẵn sàng coding khi:

- Requirement/acceptance và actor rõ.
- API/event/data contract đã được review nếu có consumer khác.
- State transition, permission, warehouse scope và audit đã xác định.
- Ảnh hưởng Ledger/Balance/Reservation/ATP được ghi rõ.
- Transaction/idempotency/concurrency strategy rõ nếu thay đổi tồn.
- Migration/compatibility impact được đánh giá.
- Test scenario và observability expectation đã có.
- Không còn business/technical decision Open ảnh hưởng trực tiếp.

---

# 25. Việc cần thực hiện ngay

1. Duyệt stack baseline modular monolith + PostgreSQL + React/NestJS hoặc ghi ADR thay thế.
2. Chốt T-001, T-002, T-004, T-007, T-010, T-011 và T-012 trong Phase 1.
3. Tạo ADR cho Inventory Core, Posting transaction, Reservation/ATP và Outbox.
4. Tạo repository skeleton, CI, local environment và OpenAPI/error contract.
5. Lập ERD v1 và movement catalog trước khi coding Phase 3/4.
6. Tạo bộ test invariant TR-INV-001…012 trước hoặc cùng lúc với Posting Service.
7. Chỉ bắt đầu Phase 5–7 sau khi Gate C có evidence đầy đủ.

