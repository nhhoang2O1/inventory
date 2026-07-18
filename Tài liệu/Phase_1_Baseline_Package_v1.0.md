# PHASE 1 – BASELINE PACKAGE

## Hệ thống quản lý kho bia – nước ngọt v3.1

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 |
| Trạng thái | Proposed Baseline – chờ sign-off |
| Ngày lập | 2026-07-17 |
| Mục tiêu Phase | Chốt nghiệp vụ, phạm vi, decision, dữ liệu, tích hợp và tiêu chí nghiệm thu trước Phase 2 |
| Phase tiếp theo | Phase 2 – Architecture Foundation |

## Tài liệu thuộc baseline

1. [Requirement_Quan_Ly_Kho_Bia_Nuoc_Ngot_v3.1.md](./Requirement_Quan_Ly_Kho_Bia_Nuoc_Ngot_v3.1.md)
2. [Phase_1_Decision_Log_v1.0.md](./Phase_1_Decision_Log_v1.0.md)
3. [Yeu_Cau_Ky_Thuat_Project_Quan_Ly_Kho_v1.0.md](./Yeu_Cau_Ky_Thuat_Project_Quan_Ly_Kho_v1.0.md)
4. [Ke_Hoach_10_Phase_3_Nguoi_Git_Parallel_v3.1.md](./Ke_Hoach_10_Phase_3_Nguoi_Git_Parallel_v3.1.md)

> Package này tổ chức và đề xuất các quyết định Phase 1. Nó chưa biến tài liệu thành Approved Baseline khi chưa có chữ ký của stakeholder.

---

# 1. Kết quả Phase 1 đã chuẩn bị

| Deliverable | Kết quả hiện tại |
|---|---|
| Business Requirement | 19 FR, 30 BR, 9 NFR, 16 UAT |
| Inventory model | On-hand, Reservation và ATP đã tách rõ |
| Multi-warehouse model | Có; pilot đề xuất một kho |
| Product model | Product 1:N SKU |
| Decision Log | 28 business decisions và 12 technical decisions có phương án đề xuất |
| Technical Requirements | Architecture, data, API, security, CI/CD, test, migration và gates |
| Execution Plan | 10 phase; Foundation Phase 1–4; Phase 5–7 chạy song song qua Git |
| Sign-off | Chưa có – là phần còn lại của Phase 1 |

---

# 2. Business outcome và tiêu chí thành công

Hệ thống cần đạt các outcome:

1. Biết chính xác On-hand và ATP theo SKU, batch, warehouse, location và status.
2. Không oversell/tồn âm khi nhiều người thao tác đồng thời.
3. Truy vết được mọi thay đổi tồn về chứng từ, actor và movement.
4. Nhập/xuất theo lô, HSD, FEFO và MRSL policy.
5. Chuyển kho bảo toàn Enterprise-owned Inventory qua IN_TRANSIT.
6. Hàng trả/recall được containment, QC và disposition có audit.
7. Báo cáo đối chiếu được về Ledger/Balance/Cost Ledger.

## KPI đề xuất cần xác nhận

| KPI | Baseline/mục tiêu đề xuất | Cách đo cần chốt |
|---|---:|---|
| Inventory Accuracy | ≥99% | Theo base quantity hay value; theo kỳ stocktake |
| Search API | p95 ≤2 giây | Dataset/tải D-107 |
| Inventory screen | p95 ≤3 giây | Bộ filter chuẩn |
| POSTED document | p95 ≤5 giây | Không tính integration async |
| Picking time | <10 phút/đơn | Cần chuẩn hóa số line/đơn và thiết bị |
| Near-expiry detection | 100% theo policy | Job latency và data-quality exception |
| Negative On-hand/ATP | 0 | Database/business invariant |
| Ledger–Balance mismatch | 0 | Reconciliation job |
| Recall containment | 100% batch scope | Từ activation đến chặn allocation/posting |

Không sử dụng KPI chưa có measurement definition để nghiệm thu hợp đồng.

---

# 3. Phạm vi MVP đề xuất

## 3.1. Bắt buộc

- FR-01 Product/SKU/UOM/Packaging/Barcode.
- FR-02 Warehouse/Zone/Location/Capacity/MixingPolicy.
- FR-03 Purchasing/Supplier/PR/PO/DeliverySchedule.
- FR-04 Goods Receipt/Receiving/Put-away/MRSL.
- FR-05 Batch/MFG/EXP/Traceability.
- FR-06 Inventory Balance/Reservation/ATP/Search.
- FR-07 Outbound/FEFO/Picking/Goods Issue.
- FR-08 Location/Warehouse Transfer và IN_TRANSIT.
- FR-10 Quality/Return/Disposition/Destruction.
- FR-11 Stocktake/Adjustment/Reversal.
- FR-16 IAM/Approval/Audit.
- FR-18 Product Recall.
- Báo cáo tồn, movement, batch/HSD và audit cơ bản.

## 3.2. Có điều kiện

- FR-09 Returnable Container/Deposit: bật nếu D-005 xác nhận có nghiệp vụ thực tế.
- FR-12 ROP/Draft PR, FR-13 Cost, FR-14 Promotion, FR-15 Dashboard, FR-17 Integration và FR-19 Supplier KPI: triển khai theo Phase 9, nhưng data source cần thiết kế từ Phase 3–7.

## 3.3. Ngoài MVP

- Microservices/Kubernetes không có bằng chứng cần thiết.
- Offline-first/native handheld app.
- AI forecasting/seasonality nâng cao.
- Route/transport optimization.
- Full accounting/AR/AP/general ledger.
- Data warehouse/BI platform hoàn chỉnh.
- Voice picking/robotics/IoT automation.

---

# 4. Operating model đã đề xuất

## 4.1. Kho và rollout

- Data model hỗ trợ nhiều kho.
- Pilot và go-live trước tại một kho đại diện.
- User có warehouse scope.
- Thêm kho sau bằng cấu hình, không thay đổi Inventory schema.

## 4.2. Inventory canonical model

```text
Warehouse On-hand
  = AVAILABLE + QUARANTINED + DAMAGED + EXPIRED + BLOCKED + RECALLED

Sellable On-hand
  = AVAILABLE

ATP
  = Sellable On-hand - Active Reservation

Enterprise-owned Inventory
  = Tổng Warehouse On-hand + IN_TRANSIT
```

- `RESERVED` không phải StockStatus.
- Confirm/Approve không đổi tồn.
- Chỉ POSTED tạo movement và balance.
- Reservation create/release không tạo movement.
- Reversal tạo movement ngược, không sửa/xóa bản gốc.
- Backorder là demand shortage, không phải balance âm.

## 4.3. System of record đề xuất

| Dữ liệu | System of record đề xuất | Ghi chú |
|---|---|---|
| Product/SKU/UOM/Barcode | WMS hoặc ERP tùy D-002 | Phải chỉ có một nguồn master chính |
| Warehouse/Location | WMS | WMS sở hữu topology kho |
| Batch/On-hand/Reservation/Movement | WMS | Không hệ thống ngoài ghi trực tiếp |
| Sales order/customer | POS/ERP nếu có | WMS có reference/minimal issue request |
| Supplier/PO | WMS hoặc ERP theo D-002 | Contract integration cần chốt |
| Cost/AR/AP/Tax | ERP/kế toán | WMS có Cost Ledger/reference, không là GL |
| Container/deposit | WMS subledger + kế toán | Chỉ bật khi D-005/D-016 duyệt |

---

# 5. Quy trình nghiệp vụ cấp cao

## 5.1. Purchasing và Inbound

~~~mermaid
flowchart LR
    PR[Purchase Request] --> AP[Approve]
    AP --> PO[Purchase Order]
    PO --> RC[Receive & Scan]
    RC --> MR{MRSL/QC Policy}
    MR -->|Pass| AV[Put-away AVAILABLE]
    MR -->|Quarantine| Q[QUARANTINED]
    MR -->|Reject| RJ[Rejected Receipt Area]
    AV --> POST[POST Goods Receipt]
    Q --> POST
    POST --> LED[Ledger + Balance + Outbox]
~~~

Điểm kiểm soát:

- PO/approval không tăng tồn.
- Hàng đã hiện diện vật lý phải có receipt/exception record dù vi phạm MRSL.
- Một receipt có thể nhận một phần và chia nhiều batch/location.
- POSTED là atomic.

## 5.2. Outbound

~~~mermaid
flowchart LR
    IR[Issue Request] --> APP[Approve]
    APP --> RES[Create Reservation]
    RES --> FEFO[FEFO Allocation]
    FEFO --> PICK[Pick & Scan]
    PICK --> GI[POST Goods Issue]
    GI --> FUL[Reduce On-hand + Fulfill Reservation]
    FUL --> EVT[Audit + Outbox]
~~~

Điểm kiểm soát:

- ATP check và reservation write trong cùng transaction/locking boundary.
- FEFO override cần quyền, lý do và audit.
- Hàng hạn chế/recall không được allocation/pick/post.

## 5.3. Transfer

```text
Kho nguồn AVAILABLE
  → POST dispatch
  → IN_TRANSIT
  → POST receive tại kho đích
  → AVAILABLE/QUARANTINED/DAMAGED tại kho đích
```

- Partial receipt và discrepancy không làm mất Enterprise-owned Inventory.
- Chuyển vị trí trong cùng kho vẫn tạo movement có nguồn/đích.

## 5.4. Return và Recall

~~~mermaid
flowchart TD
    RET[Customer Return] --> Q[QUARANTINED]
    Q --> QC[QC Inspection]
    QC -->|Pass| RESTOCK[Restock AVAILABLE]
    QC -->|Supplier fault| SRET[Supplier Return]
    QC -->|Unusable| DEST[Destroy]

    RCL[Recall Approved] --> ACT[Activate]
    ACT --> LOCK[Block allocation/picking/posting]
    LOCK --> TRACE[Forward Trace + Inventory Map]
    TRACE --> DISP[Return/Contain/Destroy]
    DISP --> CLOSE[Reconcile & Close]
~~~

- Customer Return luôn vào QUARANTINED.
- Recall ACTIVE chặn batch trên mọi kho.
- Movement containment được phép có thẩm quyền nhưng không làm hàng thành ATP.

---

# 6. Actor và quyền cấp cao

| Actor | Quyền chính | Hạn chế bắt buộc |
|---|---|---|
| System Admin | User/role/config kỹ thuật | Không mặc định có quyền nghiệp vụ/posting/cost |
| Warehouse Staff | Receiving, picking, transfer, count | Không tự approve adjustment/destruction của mình |
| Purchasing | Supplier, PR, PO | Không POST Goods Receipt nếu không có quyền kho |
| Sales | Issue Request/customer reference | Không override FEFO/MRSL nếu thiếu quyền |
| Accounting | Cost/value/deposit/period lock | Không tự sửa Ledger/Audit |
| Warehouse Manager | Approve/override/adjust/recall theo policy | Mọi action nhạy cảm có audit/four-eyes khi áp dụng |
| QA/Quality Manager | Quarantine/disposition/recall | Không tự đóng recall khi còn unmatched quantity |

RBAC luôn kết hợp warehouse scope; frontend ẩn chức năng không thay thế authorization phía server.

---

# 7. Dữ liệu cần stakeholder cung cấp

## 7.1. Master data mẫu

- Tối thiểu 30 SKU đại diện: lon, chai, thùng, két, lốc, keg nếu có.
- Product, brand, manufacturer, base UOM (THUNG/KET/KEG), quy cách đóng gói (lon/chai trên thùng) và thể tích (ml).
- Barcode 1-1 cho từng SKU.
- SKU có/không cho phép bán lẻ (thông tin khai báo thuế).
- SKU date policy, shelf life và MRSL hiện hành.

## 7.2. Warehouse sample

- Danh sách kho/chi nhánh.
- Layout một kho pilot: zone, aisle, rack, bin/location.
- Capacity theo weight/volume/pallet slot nếu có.
- Location mixing policy.
- Khu receiving, quarantine, damaged, return và destruction staging.

## 7.3. Transaction sample

- 5–10 PO/Goods Receipt thực tế.
- 5–10 đơn/phiếu xuất và trường hợp giao một phần.
- Biểu mẫu chuyển kho/kiểm kê/điều chỉnh.
- Hồ sơ khách trả, supplier return, destruction và recall nếu từng xảy ra.
- File vỏ/két/tiền cọc nếu áp dụng.

## 7.4. Migration sample

- File Excel hoặc export hệ thống cũ.
- Data dictionary/cột hiện có.
- Record count, duplicate, missing batch/HSD và opening balance.
- Danh sách PO/reservation đang mở tại cutover.

Không chốt ERD/migration production chỉ dựa trên dữ liệu ví dụ tự tạo nếu doanh nghiệp có dữ liệu thật.

---

# 8. Integration inventory cần hoàn thành

| Hệ thống | Có/không | Owner | Dữ liệu vào WMS | Dữ liệu ra WMS | Protocol | Tình trạng |
|---|---|---|---|---|---|---|
| POS/Sales | Chưa xác nhận |  | Order, customer, cancellation | Fulfillment, stock availability | TBD | OPEN |
| ERP | Chưa xác nhận |  | Product/PO/cost policy | Movement/stock/receipt/issue | TBD | OPEN |
| Accounting | Chưa xác nhận |  | Cost/period/approval reference | Value/deposit/return reference | TBD | OPEN |
| Email/SMS | Chưa xác nhận |  | Template/config | Alert/recall notification | TBD | OPEN |
| Identity Provider | Chưa xác nhận |  | User/group | Login/audit | OIDC nếu có | OPEN |

Mỗi integration phải chốt system of record, field mapping, authentication, idempotency, retry, error ownership và reconciliation.

---

# 9. UAT master scope

| UAT | Nội dung | Owner nghiệp vụ đề xuất |
|---|---|---|
| UAT-01 | PO và nhập nhiều lô | Mua hàng + Kho |
| UAT-02 | FEFO/concurrent reservation | Kho + Bán hàng |
| UAT-03 | FEFO override | Quản lý kho |
| UAT-04 | Customer Return | Kho + QA + Bán hàng |
| UAT-05 | Stocktake | Kho + Kế toán |
| UAT-06 | Warehouse Transfer | Kho nguồn + Kho đích |
| UAT-07 | Container/Deposit | Kho + Kế toán |
| UAT-08 | Reversal | Kho + Kế toán |
| UAT-09 | MRSL policy/override | Mua hàng + QA |
| UAT-10 | ROP/Draft PR | Mua hàng |
| UAT-11 | Multi-warehouse Recall | QA + Kho + Bán hàng |
| UAT-12 | Supplier KPI | Mua hàng |
| UAT-13 | RBAC/Audit | Admin + Quản lý |
| UAT-14 | Integration retry/idempotency | IT |
| UAT-15 | ATP concurrency | Kho + QA kỹ thuật |
| UAT-16 | Performance/restore | IT + Tech Lead |

Stakeholder phải xác nhận dữ liệu, expected outcome và người ký cho từng UAT trước khi đóng Phase 1.

---

# 10. RAID ban đầu

| ID | Loại | Nội dung | Owner | Xử lý |
|---|---|---|---|---|
| R-01 | Risk | 28 quyết định chưa ký khiến data model/workflow đổi sau coding | Product Owner | Decision workshop và sign-off |
| R-02 | Risk | Người A tự xây Phase 1–4 thiếu consumer review | Cả đội | B/C review Architecture/Master/Core Gate |
| R-03 | Risk | Dữ liệu thật thiếu batch/HSD/barcode | Kho + BA | Profiling và cleansing rule trước migration |
| R-04 | Risk | Hiểu RESERVED như StockStatus | Tech Lead | Canonical model, schema constraint và property test |
| R-05 | Risk | POS/ERP/accounting system of record chưa rõ | Product Owner + IT | Integration inventory và D-002/D-018 |
| R-06 | Risk | MRSL hard-code không phù hợp sản phẩm/kênh | QA + Sales + Purchasing | Policy config và D-012 |
| R-07 | Risk | Container/deposit làm scope phình lớn | Kế toán + PO | D-005/D-016 và feature flag |
| R-08 | Risk | Kho mất mạng nhưng offline không nằm MVP | IT + Kho | Site survey, network remediation, fallback SOP |
| A-01 | Assumption | Multi-warehouse model, pilot một kho | Product Owner | Xác nhận D-001 |
| A-02 | Assumption | Moving average cost | Kế toán | Xác nhận D-013/D-014 |
| A-03 | Assumption | WMS không là hệ thống công nợ | Kế toán | Xác nhận D-018 |
| DPN-01 | Dependency | Cần dữ liệu mẫu trước ERD/migration final | Kho + IT | Cung cấp theo mục 7 |

---

# 11. Workshop và sign-off plan

## Workshop 1 – Inventory và Master Data

- D-001, D-003, D-004, D-007, D-008, D-009, D-011, D-017.
- Product/SKU/UOM/Packaging/Barcode.
- On-hand/Reservation/ATP/IN_TRANSIT.

## Workshop 2 – Inbound, Outbound và Quality

- D-010, D-012, D-101, D-102, D-103, D-104, D-105, D-106.
- FEFO, MRSL, QC, Return, Recall và thiết bị.

## Workshop 3 – Commercial, Accounting và Approval

- D-002, D-005, D-006, D-013, D-014, D-015, D-016, D-018, D-109.
- Cost, deposit, return financial flow, period lock và system of record.

## Workshop 4 – Data, Integration và Operations

- D-107, D-108, D-110 và T-001…T-012.
- Migration, scale, availability, auth, infrastructure, backup và offline.

Mỗi workshop phải ghi attendee, quyết định, dissent, action owner, due date và evidence/link.

---

# 12. Phase 1 Gate checklist

## Requirement và scope

- [ ] Requirement v3.1 được Product Owner ký.
- [ ] MVP/in-scope/out-of-scope được ký.
- [ ] 19 FR và acceptance criteria được duyệt.
- [ ] 16 UAT có owner và expected result.

## Decision

- [ ] D-001…D-018 đã APPROVED/REJECTED/DEFERRED có impact accepted.
- [ ] D-101…D-110 đã APPROVED/REJECTED/DEFERRED có impact accepted.
- [ ] T-001…T-012 có owner, deadline và không còn blocker Phase 2.

## Process và data

- [ ] AS-IS/TO-BE cấp cao được kho/mua/bán/kế toán xác nhận.
- [ ] Có Product/SKU/UOM/Barcode sample.
- [ ] Có warehouse/layout/location sample.
- [ ] Có transaction/migration sample.
- [ ] Integration inventory đã xác định system of record.

## Delivery readiness

- [ ] Ba người đã được gán vai trò A/B/C.
- [ ] Người B/C đã review contract cần cho Phase 5–7.
- [ ] Phase 2 backlog và Architecture Gate được duyệt.
- [ ] Risk/assumption/dependency có owner.

Phase 1 chỉ hoàn thành khi toàn bộ mục bắt buộc được đánh dấu và có evidence. Nếu stakeholder chấp nhận defer một mục, phải ghi rõ module/feature bị loại khỏi MVP hoặc rủi ro được chấp nhận.

---

# 13. Trạng thái hiện tại và bước tiếp theo

## Đã hoàn thành về mặt soạn thảo

- Requirement v3.1 Draft.
- Execution Plan 10 Phase/Git Parallel.
- Technical Requirements v1.0 Draft.
- Decision Log với 40 phương án đề xuất.
- Scope/KPI/process/data/UAT/RAID/Gate package này.

## Còn thiếu để đóng Phase 1

1. Điền dữ liệu doanh nghiệp thật.
2. Thực hiện bốn workshop.
3. Chuyển các decision từ PROPOSED sang trạng thái đã ký.
4. Ghi system of record và integration thực tế.
5. Ký Requirement v3.1 Approved Baseline.

Không bắt đầu database/Inventory Core production trước sign-off. Có thể chuẩn bị Phase 2 bằng prototype, repository skeleton hoặc technical spike không khóa business decision.

