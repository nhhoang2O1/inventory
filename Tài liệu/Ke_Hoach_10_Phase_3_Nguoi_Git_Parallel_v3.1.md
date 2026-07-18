# KẾ HOẠCH 10 PHASE – 3 NGƯỜI PHÁT TRIỂN SONG SONG QUA GIT

## Hệ thống quản lý kho bia – nước ngọt v3.1

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản kế hoạch | 1.0 |
| Mô hình | Một owner xây Foundation Phase 1–4; ba người tách Phase 5–7; hợp nhất qua Integration Gate |
| Quy mô | 3 developer |
| Lịch tham chiếu | 38 tuần; hiệu chỉnh sau Phase 1 và Core Gate |
| Requirement nguồn | Requirement quản lý kho bia – nước ngọt v3.1 |
| Technical baseline | Modular monolith, PostgreSQL, contract-first, Inventory Core dùng chung |

---

# 1. Kết luận về tính khả thi

Mô hình đề xuất **khả thi** nếu đáp ứng đủ các điều kiện sau:

1. Phase 1–4 tạo ra Foundation thật sự ổn định, không chỉ là project skeleton.
2. Posting Service, Reservation/ATP, authentication, audit và OpenAPI contract được khóa tại Core Gate.
3. Phase 5, 6 và 7 chỉ sử dụng public contract của Inventory Core; không sửa trực tiếp bảng số dư.
4. Mỗi phase có module/database ownership riêng để giảm merge conflict.
5. Hai người chưa coding Phase 1–4 vẫn phải review tại Architecture, Master Data và Core Gate.
6. Database migration, shared contract và movement type mới phải được điều phối tập trung.
7. Có Integration Branch/Gate để ghép Phase 5–7 và chạy full regression trước khi merge vào `main`.

Mô hình **không khả thi an toàn** nếu một người tự hoàn thành Phase 1–4, tự merge không review, rồi giao code chưa có contract/test cho hai người còn lại.

---

# 2. Phân công tổng quát

## Người A – Foundation Owner

- Owner chính Phase 1–4.
- Sau Core Gate thực hiện Phase 5 Purchasing & Inbound.
- Sau Operations Gate thực hiện Phase 8 Quality, Return & Recall.
- Owner cuối của Inventory Core, Posting contract và database canonical model.

## Người B – Outbound/Reporting Owner

- Review UX/API tại Phase 2, Product/Warehouse contract tại Phase 3 và ATP contract tại Phase 4.
- Sau Core Gate thực hiện Phase 6 Outbound & FEFO.
- Sau Operations Gate thực hiện Phase 9 Planning, KPI, Reports & Integration.

## Người C – Transfer/Release Owner

- Review CI/test/security tại Phase 2, IAM/Audit tại Phase 3 và integrity/concurrency tại Phase 4.
- Sau Core Gate thực hiện Phase 7 Transfer & Stocktake.
- Chuẩn bị Phase 10 từ sớm; sau Feature Complete làm UAT, migration, deployment và go-live.

## Stakeholder bắt buộc ngoài developer

- Product Owner/quản lý kho ký business decision và UAT.
- Đại diện mua hàng, bán hàng và kế toán xác nhận quy trình liên quan.
- Người A điều phối Phase 1 nhưng không được tự quyết nghiệp vụ thay stakeholder.

---

# 3. Lịch tổng quát

| Tuần | Phase | Người A | Người B | Người C | Kết quả/Gate |
|---:|---|---|---|---|---|
| 1–2 | Phase 1 | Owner Discovery/Baseline | Review workshop đầu ra | Review NFR/tích hợp | Requirement Gate |
| 3–5 | Phase 2 | Kiến trúc, repo, backend, DB | Review API/UX; chuẩn bị mock | Review CI/test/security | Architecture Gate |
| 6–9 | Phase 3 | Xây IAM + Master Data + Warehouse baseline | Review Product/Warehouse contract | Review IAM/Audit/import | Master Data Gate |
| 10–16 | Phase 4 | Xây Inventory Core hoàn chỉnh | Review Reservation/ATP/OpenAPI | Review idempotency/concurrency/reconciliation | Core Gate + Git tag |
| 17–22 | Phase 5/6/7 | Phase 5 Inbound | Phase 6 Outbound | Phase 7 Transfer/Stocktake | Ba nhánh chạy song song |
| 23–24 | Integration | Hỗ trợ merge/core fixes | Hỗ trợ merge/contract fixes | Integration lead/full regression | Operations Gate |
| 25–30 | Phase 8/9/10-prep | Phase 8 Quality/Recall | Phase 9 phần độc lập Recall | Test/migration/security/performance prep | Parallel Wave 2 |
| 31–32 | Complete Phase 9 | Hỗ trợ Recall contract | Hoàn tất Recall report/integration | Release candidate automation | Feature Complete |
| 33–38 | Phase 10 | Migration/core support | UAT/UI/report fixes | Release lead/deploy/restore | Go-live |

Lịch 38 tuần là baseline cho ba developer. Nếu Người B/C thực sự không tham gia review Phase 1–4, rủi ro rework tăng và lịch có thể dài hơn.

---

# 4. Gantt theo mô hình mới

~~~mermaid
gantt
    title 10 Phase - Foundation một owner, Phase 5-7 chạy song song
    dateFormat YYYY-MM-DD
    axisFormat Tuần %W
    tickInterval 1week

    section Foundation - Người A owner
    Phase 1 - Requirement Baseline       :crit, p1, 2026-01-05, 14d
    Phase 2 - Architecture Foundation    :crit, p2, after p1, 21d
    Phase 3 - IAM & Master Data          :crit, p3, after p2, 28d
    Phase 4 - Inventory Core             :crit, p4, after p3, 49d
    Core Gate / Git Tag                  :milestone, core, after p4, 0d

    section Người A
    Phase 5 - Purchasing & Inbound       :a5, after core, 42d
    Integration 5-7                     :crit, int, after a5, 14d
    Phase 8 - Quality & Recall           :a8, after int, 42d
    Phase 10 - Migration/Core support    :a10, after a8, 56d

    section Người B
    Phase 6 - Outbound & FEFO            :b6, after core, 42d
    Phase 9A - Planning/KPI/Reports      :b9a, after int, 42d
    Phase 9B - Recall integration        :b9b, after b9a, 14d
    Phase 10 - UAT/Report fixes          :b10, after b9b, 42d

    section Người C
    Phase 7 - Transfer & Stocktake       :c7, after core, 42d
    Phase 10 preparation                 :cprep, after int, 56d
    Phase 10 - Release & Go-live         :crit, c10, after cprep, 42d
~~~

---

# 5. Git workflow

## 5.1. Nhánh chính

| Nhánh/tag | Mục đích |
|---|---|
| `main` | Code đã vượt gate, luôn build/test được |
| `feature/phase-1-baseline` | Tài liệu/config Phase 1 nếu quản lý cùng repository |
| `feature/phase-2-foundation` | Repository, architecture, CI/CD |
| `feature/phase-3-master-data` | IAM và Master Data |
| `feature/phase-4-inventory-core` | Inventory Core |
| `phase-4-core-gate` | Git tag bất biến làm điểm xuất phát Phase 5–7 |
| `feature/phase-5-inbound` | Nhánh Người A |
| `feature/phase-6-outbound` | Nhánh Người B |
| `feature/phase-7-transfer-stocktake` | Nhánh Người C |
| `integration/operations` | Nhánh ghép Phase 5–7 và chạy regression |
| `feature/phase-8-quality-recall` | Nhánh Người A sau Operations Gate |
| `feature/phase-9-planning-reporting` | Nhánh Người B sau Operations Gate |
| `release/phase-10` | Release candidate, UAT, migration và go-live |

## 5.2. Trình tự Foundation

1. Người A phát triển từng Phase 1–4 trên nhánh ngắn hoặc nhánh phase.
2. Cuối mỗi phase tạo pull request vào `main`.
3. Người B/C review theo gate; không cần cùng code toàn phase nhưng phải kiểm tra contract liên quan.
4. Sau Phase 4, chạy toàn bộ Core Gate.
5. Merge `main` và tạo annotated tag `phase-4-core-gate`.
6. Cả ba tạo Phase 5/6/7 branch từ đúng tag này.

## 5.3. Quy tắc Phase 5–7

```bash
git switch main
git pull --ff-only
git switch -c feature/phase-5-inbound phase-4-core-gate
```

Người B/C đổi tên branch tương ứng. Trong quá trình thực hiện:

- Không merge trực tiếp giữa ba feature branch.
- Shared/core fix tạo pull request nhỏ vào `main`, sau đó cả ba rebase/merge `main` vào branch mình.
- Đồng bộ với `main` tối thiểu hai lần/tuần.
- Không cherry-pick cùng một shared commit sang nhiều nhánh.
- Không force-push branch người khác.
- Commit database migration một mục đích, tên có timestamp/module rõ ràng.

## 5.4. Integration merge

1. Tạo `integration/operations` từ `main` tại thời điểm kết thúc tuần 22.
2. Rebase từng Phase branch lên `main` mới nhất và chạy CI riêng.
3. Merge Phase 5 vào integration, chạy migration + full tests.
4. Merge Phase 6, chạy lại toàn bộ tests và UAT liên quan.
5. Merge Phase 7, chạy full regression, concurrency và reconciliation.
6. Sửa lỗi tích hợp trên nhánh integration bằng PR có owner rõ.
7. Chỉ merge `integration/operations` vào `main` khi Operations Gate pass.
8. Tạo tag `operations-gate`.

Thứ tự merge 5 → 6 → 7 là trình tự kiểm soát, không có nghĩa Phase 6/7 phụ thuộc code trực tiếp vào Phase 5.

---

# 6. Contract phải khóa trước khi tách nhánh

| Contract | Owner | Consumer | Điều kiện freeze |
|---|---|---|---|
| Authentication/RBAC context | A | B, C | Master Data Gate |
| Product/SKU/UOM contract | A | B, C | Master Data Gate |
| Warehouse/Location contract | A | B, C | Master Data Gate |
| Document state/approval contract | A | B, C | Master Data/Core Gate |
| InventoryBalance query | A | B, C | Core Gate |
| Posting Service command/result | A | B, C | Core Gate |
| Reservation/ATP contract | A, B review | A, B, C | Core Gate |
| Movement type catalog | A | B, C | Core Gate |
| Idempotency/Error/Audit schema | A, C review | A, B, C | Core Gate |
| OpenAPI `/api/v1` | A | Frontend/integration | Core Gate |

Sau freeze, breaking change cần:

1. Impact analysis cho Phase 5–7.
2. Review của cả ba người.
3. Backward-compatible migration/contract hoặc đồng bộ merge có kế hoạch.
4. Cập nhật mock, contract test và ADR.

---

# 7. Quy tắc ownership giảm merge conflict

## Người A – Phase 5

Được sở hữu:

- `modules/purchasing/**`
- `modules/receiving/**`
- Supplier, PR, PO, DeliverySchedule, GoodsReceipt migrations.
- MRSL inbound policy consumer.

Không được tự ý sửa:

- Inventory Balance/Movement schema.
- ATP/Reservation công thức.
- Shared auth/error schema sau freeze.

## Người B – Phase 6

Được sở hữu:

- `modules/outbound/**`
- `modules/allocation/**`
- `modules/picking/**`
- IssueRequest, PickTask, GoodsIssue migrations và UI.

Không được tự ý sửa:

- Inventory Core để phục vụ FEFO riêng.
- Tính ATP tại frontend.
- Thêm StockStatus `RESERVED`.

## Người C – Phase 7

Được sở hữu:

- `modules/transfer/**`
- `modules/stocktake/**`
- `modules/adjustment/**`
- Transfer, Count, Adjustment và Reversal migrations.

Không được tự ý sửa:

- IN_TRANSIT invariant.
- Posting/Reversal canonical transaction.
- Ledger/Audit lịch sử.

## Shared/Core change

Các thư mục `inventory-core`, `iam`, `shared-contracts`, database foundation và CI pipeline cần ít nhất hai reviewer. Nếu thay đổi invariant tồn kho, cả ba phải review.

---

# 8. Phase 1 – Requirement Baseline

## Owner

Người A điều phối; stakeholder quyết định; Người B/C review đầu ra.

## Công việc

- Chốt 28 business decision.
- Chốt Product 1:N SKU, UOM, barcode và warehouse scope.
- Chốt On-hand, Reservation, ATP, IN_TRANSIT và POSTED.
- Chốt FEFO, MRSL, Return, Recall, Container và Cost.
- Chốt MVP scope, acceptance criteria và UAT-01…16.
- Chốt các technical decision quan trọng về hạ tầng, auth, tích hợp, thiết bị và tải.

## Gate

- Requirement v3.1 Approved Baseline.
- Không còn decision Open ảnh hưởng Core.
- B/C xác nhận requirement đủ để thiết kế consumer Phase 6/7.

---

# 9. Phase 2 – Architecture Foundation

## Người A thực hiện

- Modular monolith structure, PostgreSQL và worker/outbox skeleton.
- Backend/frontend skeleton, local Docker và migration framework.
- CI/CD, OpenAPI/error/idempotency convention.
- ERD/module boundary và ADR nền.

## Review tối thiểu

- Người B review frontend/API ergonomics và mockability.
- Người C review CI, test, security, deployment và observability.

## Gate

- Một commit có thể build/test/deploy test tự động.
- Local environment dựng bằng một quy trình được tài liệu hóa.
- Contract/error/auth convention được duyệt.

---

# 10. Phase 3 – IAM và Master Data

## Người A thực hiện

- User/Role/Permission/WarehouseScope và Approval Policy baseline.
- Product, SKU, UOM, Packaging, Barcode.
- Warehouse, Zone, Location, Capacity và Mixing Policy.
- Audit cho authentication/master data.
- Import/export master data cơ bản.

## Review tối thiểu

- Người B review Product/Warehouse API và UI contract cần cho Phase 6.
- Người C review RBAC/Audit/Location contract cần cho Phase 7.

## Gate

- Product 1:N SKU enforce.
- Barcode không trùng và conversion lịch sử ổn định.
- RBAC/warehouse scope negative test pass.
- API contract dùng được bằng mock.

---

# 11. Phase 4 – Inventory Core

## Người A thực hiện

- Batch và StockStatus canonical.
- InventoryBalance, InventoryReservation và Movement Ledger.
- Posting Service, reversal và state transition.
- ATP, lock/version và idempotency.
- Transactional Outbox, audit và reconciliation.
- Query On-hand/Reservation/ATP/IN_TRANSIT.
- Unit, integration, property và concurrency tests.

## Review bắt buộc

- Người B chạy contract test Reservation/ATP và thiết kế thử consumer Outbound.
- Người C chạy contract test Posting/Reversal và concurrency/reconciliation.
- Cả ba review movement type catalog và database migration.

## Core Gate

1. Không StockStatus `RESERVED`.
2. ATP = Sellable On-hand − Active Reservation.
3. Reservation release không tạo movement.
4. Chỉ POSTED thay đổi balance.
5. Posting atomic và idempotent.
6. Retry không tạo trùng.
7. Concurrency không oversell hoặc balance/ATP âm.
8. Ledger–Balance reconciliation đạt 100%.
9. OpenAPI/contract test pass.
10. Git tag `phase-4-core-gate` được tạo từ `main` sạch.

---

# 12. Phase 5 – Người A: Purchasing & Inbound

- Supplier, business calendar và lead time.
- PR, approval, PO và DeliverySchedule.
- Partial receipt, tolerance và backorder.
- Goods Receipt, receiving, put-away và POSTED.
- MRSL inbound REJECT/QUARANTINE/ALLOW_WITH_APPROVAL.
- Supplier KPI source data.
- UAT-01 và UAT-09.

Đầu ra phải chỉ gọi Posting Service từ Core Gate; không sửa balance repository.

---

# 13. Phase 6 – Người B: Outbound & FEFO

- Issue Request và Reservation lifecycle.
- FEFO allocation/tie-break/MRSL outbound.
- Picking, scan barcode và partial pick.
- Goods Issue POSTED và reservation fulfillment.
- FEFO override, permission, reason và audit.
- UAT-02, UAT-03 và UAT-15.

Frontend/backend Outbound phải dùng ATP contract; không sao chép công thức ATP.

---

# 14. Phase 7 – Người C: Transfer & Stocktake

- Location transfer và warehouse transfer hai bước.
- Source → IN_TRANSIT → destination.
- Partial receipt và damage/loss khi chuyển.
- Blind count, recount và location lock.
- Adjustment, approval và reversal.
- UAT-05, UAT-06 và UAT-08.

Transfer/Reversal phải dùng Posting Service và movement catalog đã freeze.

---

# 15. Operations Integration Gate

Sau khi ba nhánh hoàn tất:

- Migration chạy được từ database tại `phase-4-core-gate` lên bản tích hợp.
- UAT-01/02/03/05/06/08/09/15 pass.
- Full unit/integration/contract/E2E pass.
- Concurrent Inbound/Outbound/Transfer không deadlock vượt ngưỡng hoặc sai tồn.
- Ledger–Balance–Reservation reconciliation 100%.
- Không Sev 1/2.
- OpenAPI không có breaking change chưa duyệt.
- `integration/operations` merge vào `main` và tạo tag `operations-gate`.

---

# 16. Phase 8 – Người A: Quality, Return & Recall

Phase 8 bắt đầu từ tag `operations-gate`.

- Quality Case, QC inspection và disposition.
- Customer Return/Supplier Return/Destruction.
- Recall Case, approval, activation và containment.
- Chặn allocation/picking/posting batch recall.
- Forward trace và Inventory Mapping API.
- Authorized internal movement cho hàng RECALLED.
- UAT-04, UAT-07 và UAT-11.

Người B cung cấp adapter/query Outbound khi Recall cần Goods Issue/Picking; thay đổi contract phải bằng PR riêng.

---

# 17. Phase 9 – Người B: Planning, KPI, Reports & Integration

## Có thể làm song song với Phase 8

- ROP, Safety Stock và Draft PR.
- Supplier KPI từ dữ liệu Phase 5.
- Dashboard/report Inbound, Outbound, Transfer và Stocktake.
- Inventory Cost Ledger/report value.
- POS/ERP/kế toán integration, retry/dead-letter/reconciliation.
- UAT-10, UAT-12 và UAT-14.

## Phần phải chờ Phase 8

- Recall dashboard/report.
- Quality/Return/Destruction report.
- Cross-module exception summary có dữ liệu Recall.

Do đó Phase 9 có thể chạy khoảng 80–90% song song Phase 8, nhưng chỉ đóng sau Recall Gate.

---

# 18. Phase 10 – Người C lead, cả đội tham gia

## Chuẩn bị song song Phase 8/9

- Full regression automation.
- Migration tooling và hai dry-run.
- Performance/concurrency/soak test.
- Security/RBAC/permission test.
- Backup/restore rehearsal và monitoring/runbook.
- Staging/UAT/release pipeline.

## Chỉ thực hiện sau Phase 8/9

- UAT-01…16 chính thức.
- Final migration rehearsal và sign-off.
- Go/no-go, cutover, smoke test và rollback decision.
- Hypercare và production reconciliation.

Người C là Release Lead nhưng Người A/B phải sửa lỗi module và cùng trực cutover; Phase 10 không thể giao độc lập hoàn toàn cho một người.

---

# 19. CI bắt buộc cho mỗi Phase branch

Mọi pull request Phase 5–9 phải chạy:

1. Format/lint/type-check.
2. Unit tests của module.
3. Inventory Core regression tests.
4. PostgreSQL integration tests.
5. Database migration từ schema Core Gate/Operations Gate phù hợp.
6. OpenAPI/contract compatibility check.
7. Authorization negative tests liên quan.
8. Idempotency/retry test cho command/consumer.
9. Docker build.
10. E2E smoke test với các module đã tích hợp.

PR thay đổi shared/core phải chạy thêm full property/concurrency/reconciliation suite.

---

# 20. Quy tắc xử lý xung đột

| Loại xung đột | Owner quyết định | Quy trình |
|---|---|---|
| Inventory invariant/Posting | Người A, cả ba review | ADR + core PR trước khi sửa phase branch |
| Outbound/ATP consumer | Người B | Contract test, không sửa Core ngầm |
| Transfer/Reversal | Người C | Contract test và ledger reconciliation |
| Database migration number/order | Người C điều phối integration | Rebase/rename migration trước merge |
| API breaking change | Cả ba | Version/compatibility plan bắt buộc |
| Business rule | Product Owner | Update requirement/acceptance trước code |

Không giải quyết merge conflict bằng cách chọn toàn bộ “ours/theirs” đối với migration, OpenAPI, shared contract hoặc Inventory Core mà không review nội dung.

---

# 21. Review matrix

| PR của | Reviewer chính | Reviewer thứ hai khi ảnh hưởng Core |
|---|---|---|
| Người A | Người B | Người C |
| Người B | Người C | Người A |
| Người C | Người A | Người B |

Cuối Phase 1–4, cả hai người còn lại phải review gate evidence dù Người A là owner duy nhất của implementation.

---

# 22. Rủi ro và biện pháp

| Rủi ro | Tác động | Biện pháp |
|---|---|---|
| Người A thiết kế Foundation sai | Cả Phase 5–7 phải làm lại | B/C review ba gate, contract tests và consumer spike trước Core Gate |
| Hai người chờ đến tuần 17 mới đọc code | Khởi động chậm | Review Phase 2–4, chạy local và mock consumer trước khi tách nhánh |
| Ba nhánh sửa cùng Inventory Core | Merge conflict/sai tồn | Freeze Core, shared fix qua `main`, CODEOWNERS và full review |
| Database migration đụng nhau | Không deploy được | Module ownership, timestamp naming, integration migration test |
| Branch lệch `main` sáu tuần | Merge rất khó | Đồng bộ `main` tối thiểu hai lần/tuần |
| Phase 9 hoàn tất trước Recall | Báo cáo thiếu | Tách phần độc lập và completion adapter sau Phase 8 |
| Người C bị xem là người duy nhất test | Lọt lỗi/quá tải | Mỗi owner viết test; C chỉ lead integration/release |
| Phase 10 giao hoàn toàn cho C | Release bottleneck | C lead, A/B chịu trách nhiệm module và cùng cutover |

---

# 23. Definition of Done của một Phase branch

- Code và migration hoàn chỉnh.
- Không sửa Core contract trái phép.
- Unit/integration/authorization/idempotency test pass.
- OpenAPI/event contract và tài liệu cập nhật.
- Audit/log/metric cần thiết đã có.
- Branch đã đồng bộ với `main` mới nhất.
- PR được review theo matrix.
- UAT liên quan có evidence.
- Không Sev 1/2.
- Reconciliation không phát hiện sai lệch.

---

# 24. Việc cần làm ngay

1. Gán tên thật cho Người A/B/C và xác nhận Người A đủ năng lực backend/database/architecture.
2. Chỉ định Product Owner và key user; Người A không tự chốt business rule.
3. Dùng Phase 1 để khóa 28 quyết định và Technical Decision quan trọng.
4. Thiết lập protected `main`, branch naming, PR template và CODEOWNERS.
5. Trong Phase 2, tạo OpenAPI/error/idempotency convention để B/C có thể làm mock.
6. Yêu cầu B/C chạy local và consumer spike trước khi ký Core Gate.
7. Chỉ tạo ba branch Phase 5–7 từ tag `phase-4-core-gate` đã pass đầy đủ.

