# PHASE 1 – DECISION LOG

## Hệ thống quản lý kho bia – nước ngọt v3.1

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 |
| Trạng thái | Proposed – chờ stakeholder xác nhận |
| Ngày lập | 2026-07-17 |
| Nguồn | Requirement v3.1, Technical Requirements v1.0, Plan 10 Phase Git Parallel v3.1 |
| Mục tiêu | Đưa ra phương án mặc định cho 28 quyết định nghiệp vụ và 12 quyết định kỹ thuật |

## Quy ước trạng thái

- `PROPOSED`: Có phương án khuyến nghị, chưa được người có thẩm quyền ký.
- `APPROVED`: Đã chấp thuận và có người/ngày xác nhận.
- `REJECTED`: Không sử dụng phương án, phải ghi phương án thay thế.
- `DEFERRED_WITH_IMPACT_ACCEPTED`: Hoãn có chủ đích, đã ghi phạm vi không thực hiện và người chấp nhận rủi ro.
- `OPEN`: Chưa có phương án; không được tồn tại khi đóng Phase 1.

> Hiện không mục nào được tự động đánh dấu APPROVED. Người lập tài liệu không thay thế Product Owner, quản lý kho hoặc kế toán.

---

# 1. Quyết định nghiệp vụ P0

| ID | Phương án đề xuất | Lý do/ảnh hưởng | Owner phê duyệt | Trạng thái |
|---|---|---|---|---|
| D-001 | Data model hỗ trợ nhiều kho ngay từ đầu; MVP pilot và go-live trước tại một kho đại diện. | Tránh sửa schema sau này, giảm rủi ro rollout. | Product Owner + Quản lý kho | PROPOSED |
| D-002 | WMS là system of record cho tồn kho, lô, vị trí và chứng từ kho. POS/ERP là nguồn đơn bán/khách hàng nếu doanh nghiệp đã có; nếu chưa có, WMS lưu CustomerReference và IssueRequest tối thiểu. | Không tạo hai nguồn tồn; vẫn chạy được standalone trong pilot. | Product Owner + IT | PROPOSED – cần xác nhận hệ thống hiện có |
| D-003 | Đơn vị lưu kho cơ sở của SKU là Thùng/Két/Keg nguyên đai nguyên kiện. Không cho phép xé lẻ/phá thùng trong kho vật lý. Số lượng lon/chai và thể tích Lít bia phục vụ khai báo thuế được tính toán động (on-the-fly) ở tầng hóa đơn/báo cáo dựa trên thông số tĩnh của SKU (`packaging_specification` và `volume_ml`). | Đơn giản hóa vận hành kho, thủ kho chỉ quét barcode thùng, loại bỏ sai lệch số lẻ lẻ và tinh gọn CSDL. | Kho + Kế toán | APPROVED |
| D-004 | Barcode liên kết trực tiếp 1-1 với SKU lưu kho (mỗi SKU đóng gói nguyên kiện có một mã vạch riêng, ví dụ Tiger thường và Tiger Tết có mã vạch khác nhau). Không quản lý nhiều barcode cho nhiều cấp đóng gói xé lẻ. | Phù hợp việc nhập xuất nguyên thùng và quét barcode định danh nhanh tại kho. | Kho | APPROVED |
| D-005 | Bật module bao bì hoàn trả theo cấu hình. SKU/ContainerType nào không dùng thì không phát sinh nghiệp vụ. Vỏ chai/két/keg/pallet và tiền cọc chỉ nằm trong MVP nếu doanh nghiệp thực tế có đối soát. | Giữ kiến trúc sẵn sàng nhưng tránh ép mọi SKU vào container flow. | Product Owner + Kế toán | PROPOSED – cần xác nhận phạm vi |
| D-006 | Keg hoặc tài sản có giá trị cao/do doanh nghiệp sở hữu được theo serial. Pallet/két thông thường theo số lượng; chỉ bật serial theo ContainerType. | Cân bằng truy vết và chi phí scan. | Kho + Kế toán | PROPOSED – cần danh sách tài sản |
| D-007 | Reservation được tạo khi IssueRequest/đơn bán đã APPROVED và bắt đầu allocation. TTL cấu hình theo kênh; không dùng một TTL toàn hệ thống. Hủy/hết hạn giải phóng idempotent. | Tránh giữ hàng từ đơn nháp và phù hợp nhiều kênh bán. | Bán hàng + Kho | PROPOSED – cần chốt TTL theo kênh |
| D-008 | Chỉ POSTED tạo Inventory Movement và thay đổi Inventory Balance. Confirm/Approve chỉ thay đổi workflow. | Một ranh giới transaction duy nhất, dễ audit và reversal. | Kho + Kế toán | PROPOSED |
| D-009 | Không cho On-hand hoặc ATP âm. Backorder/pre-order lưu thành nhu cầu thiếu riêng, không ghi balance âm. | Tránh sai tồn và vẫn hỗ trợ nhu cầu chưa đáp ứng. | Product Owner | PROPOSED |
| D-010 | FEFO là mặc định bắt buộc cho hàng có EXP. Override cần permission, lý do, manager approval/audit theo policy. SKU không có EXP dùng FIFO hoặc policy riêng. | Phù hợp FMCG và không ép FEFO cho hàng không có HSD. | Quản lý kho + QA | PROPOSED |
| D-011 | Batch bắt buộc với bia/nước ngọt có thông tin lô/HSD. Khóa uniqueness đề xuất: SKU + Manufacturer/Supplier scope + Batch No. MFG/EXP bắt buộc theo SKU date policy. | Tránh giả định batch number unique toàn doanh nghiệp. | Kho + QA | PROPOSED |
| D-012 | MRSL là chính sách kiểm duyệt HSD tối thiểu theo chiều Nhập/Xuất, SKU/nhà cung cấp/khách hàng, được đo lường bằng Số ngày còn lại (`min_remaining_days`). Pilot đề xuất inbound tối thiểu 90 ngày cho bia; outbound theo yêu cầu từng kênh (WinMart 90 ngày, đại lý 30 ngày). Vi phạm dùng REJECT/QUARANTINE/ALLOW_WITH_APPROVAL. | Sử dụng số ngày cứng dễ tính toán và khớp 100% với hợp đồng thương mại thực tế của các siêu thị/đối tác. | Mua hàng + Bán hàng + QA | APPROVED |
| D-013 | Giá vốn MVP dùng moving weighted average theo SKU + warehouse hoặc phạm vi kế toán được duyệt; Inventory Cost Ledger bất biến. | Dễ đối soát hơn FIFO/lô cho đội nhỏ, phù hợp baseline cũ. | Kế toán | PROPOSED – bắt buộc ký |
| D-014 | Chiết khấu mua và chi phí mua trực tiếp được phân bổ theo policy kế toán; thuế được khấu trừ không vào giá vốn; hàng tặng có movement và cost allocation theo quyết định kế toán. | Tránh hard-code xử lý tài chính chưa được duyệt. | Kế toán | PROPOSED – cần công thức chính thức |
| D-015 | Four-eyes bắt buộc cho adjustment, destruction, recall activation/closure, sửa giá/cost, cấp quyền đặc biệt và override lớn. Ngưỡng tiền/số lượng cấu hình theo ApprovalPolicy. | Kiểm soát gian lận nhưng không hard-code ngưỡng. | Sponsor + Kế toán + Kho | PROPOSED – cần ngưỡng |
| D-016 | Customer Return tách luồng hàng hóa và tài chính. Hàng vào QUARANTINED; hoàn tiền/công nợ do POS/ERP/kế toán xử lý qua reference. Container/deposit cập nhật ledger riêng. | Không trộn Inventory Ledger với sổ công nợ. | Kế toán + Bán hàng | PROPOSED – cần policy hoàn tiền/cọc |
| D-017 | Chuyển kho dùng hai bước POSTED: kho nguồn → IN_TRANSIT → kho đích; cho phép partial receipt, damage/loss và discrepancy case. | Bảo toàn Enterprise-owned Inventory trong vận chuyển. | Quản lý kho | PROPOSED |
| D-018 | WMS không quản lý công nợ chính thức trong MVP. Chỉ lưu reference, trạng thái đồng bộ và container/deposit subledger; ERP/kế toán là system of record tài chính. | Giảm scope và tránh hai sổ tài chính. | Kế toán + Sponsor | PROPOSED – cần xác nhận hệ thống kế toán |
| D-019 | Thuế suất (VAT và Thuế tiêu thụ đặc biệt) quản lý qua bảng cấu hình `tax_groups` riêng. Tại thời điểm lập đơn bán/đơn mua, mức thuế suất hiện hành sẽ được chụp lại (snapshot) tại dòng chi tiết đơn hàng để lưu lịch sử hóa đơn tài chính bất biến. | Đảm bảo an toàn khi nhà nước thay đổi biểu thuế, không làm sai lệch lịch sử doanh thu/thuế trong quá khứ. | Kế toán + IT | APPROVED |
| D-020 | Vai trò người dùng (IAM) được liên kết trực tiếp qua cột `role_id` trong bảng `users`, loại bỏ bảng trung gian nhiều-nhiều `user_roles`. Mỗi người dùng chỉ giữ một vai trò hoạt động tại một thời điểm. | Tiết kiệm bộ nhớ, đơn giản hóa câu lệnh truy vấn phân quyền hệ thống. | Sponsor + IT | APPROVED |
| D-021 | Sử dụng cơ chế Xóa mềm (Soft Delete) bằng trường `deleted_at` cho tất cả các bảng danh mục cốt lõi (`products`, `skus`, `customers`, `suppliers`, `users`) thay vì xóa cứng. | Bảo toàn tính toàn vẹn dữ liệu và các liên kết khóa ngoại với các chứng từ lịch sử. | IT + Kế toán | APPROVED |

---

# 2. Quyết định nghiệp vụ P1

| ID | Phương án đề xuất | Lý do/ảnh hưởng | Owner phê duyệt | Trạng thái |
|---|---|---|---|---|
| D-101 | Tolerance nhận dư/thiếu cấu hình theo supplier/SKU. Mặc định an toàn 0%; pilot có thể dùng ±2% hoặc một packaging unit sau khi Mua hàng duyệt. Vượt tolerance cần approval. | Không áp một tỷ lệ cho mọi nhà cung cấp. | Mua hàng + Kế toán | PROPOSED – cần chốt mặc định |
| D-102 | Supplier receipt đạt policy có thể vào AVAILABLE sau basic inspection. Lô vi phạm MRSL, damage, recall hoặc SKU yêu cầu QC vào QUARANTINED. Mọi Customer Return luôn vào QUARANTINED. | Giảm tắc nghẽn nhưng giữ quality control theo rủi ro. | Kho + QA | PROPOSED |
| D-103 | Near-expiry, aging và slow-moving cấu hình theo SKU/category. Giá trị pilot đề xuất: near-expiry theo min(30 ngày, 20% shelf life); slow-moving khi không xuất 30 ngày; aging cảnh báo 90 ngày. | Chỉ dùng làm seed config, không là hard constraint. | Kho + Bán hàng | PROPOSED – cần hiệu chỉnh từ dữ liệu thật |
| D-104 | Hỗ trợ blind count và cycle count. Mọi variance cần recount ít nhất một lần; approval threshold cấu hình theo SKU class, số lượng và giá trị. | Không bỏ qua chênh lệch nhỏ nhưng phân cấp xử lý hợp lý. | Kho + Kế toán | PROPOSED |
| D-105 | CapacityRule hỗ trợ weight, volume và pallet slot; Location chỉ enforce dimension đã được cấu hình. Thiếu dimension thì cảnh báo thay vì chặn sai. | Phù hợp kho có mức dữ liệu khác nhau. | Quản lý kho | PROPOSED |
| D-106 | Hỗ trợ EAN/UPC/Code128/QR theo thiết bị thực tế; scanner kiểu keyboard wedge là baseline web. In tem nội bộ dùng Code128/QR; printer model chốt sau site survey. | Tương thích thiết bị phổ biến, không khóa vendor. | Kho + IT | PROPOSED – cần kiểm tra thiết bị |
| D-107 | Migration MVP từ Excel/phần mềm cũ gồm master data, location, batch, opening balance, PO/reservation mở nếu dữ liệu đủ sạch. Không migrate toàn bộ lịch sử; giữ archive/read-only nếu cần. Test profile tạm: 20.000 SKU, 10 kho, 5 triệu movement, 50 concurrent users. | Giảm rủi ro migration và có baseline performance. | Product Owner + IT + Kế toán | PROPOSED – cần file mẫu và quy mô thật |
| D-108 | Đề xuất uptime 99,5%; RPO ≤15 phút; RTO ≤4 giờ; audit retention tối thiểu 5 năm; attachment/chứng từ theo policy pháp lý-kế toán được xác nhận. | Cần mục tiêu để thiết kế hạ tầng/backup; retention cuối phải do doanh nghiệp duyệt. | Sponsor + IT + Kế toán | PROPOSED – bắt buộc ký |
| D-109 | Có inventory/accounting period lock theo tháng. POSTED trong kỳ khóa bị chặn; reopen cần permission, lý do và approval. Reversal ghi ở kỳ mở theo policy kế toán. | Bảo vệ số liệu đã đối soát. | Kế toán | PROPOSED |
| D-110 | Không làm offline-first trong MVP. Dùng responsive web/PWA-ready; khi mất mạng áp dụng SOP tạm và chỉ thêm offline sau ADR/conflict design riêng. | Offline command tồn có rủi ro xung đột cao cho đội nhỏ. | Product Owner + Kho + IT | PROPOSED |

---

# 3. Quyết định kỹ thuật

| ID | Phương án đề xuất | Owner | Hạn chốt | Trạng thái |
|---|---|---|---|---|
| T-001 | Ưu tiên cloud/managed PostgreSQL và object storage; Dockerized API/Web/Worker. Nếu on-premise bắt buộc, giữ cùng container topology và backup off-host. | Sponsor + IT | Phase 1 | PROPOSED – cần biết hạ tầng |
| T-002 | Nếu chưa có Identity Provider, dùng local authentication với access/refresh token, Argon2id/bcrypt, MFA admin/người duyệt nhạy cảm. Thiết kế OIDC-ready. | Tech Lead + IT | Phase 1/2 | PROPOSED |
| T-003 | NestJS/TypeScript + PostgreSQL. Chọn ORM/query builder ở Phase 2 sau spike row lock/migration; tiêu chí là explicit transaction, `FOR UPDATE`, optimistic version và SQL visibility. | Tech Lead | Phase 2 | PROPOSED – spike bắt buộc |
| T-004 | Responsive web, không offline-first/native app trong MVP. | Product Owner + Tech Lead | Phase 1 | PROPOSED |
| T-005 | PostgreSQL Transactional Outbox + Worker đủ cho MVP; chưa thêm Kafka/RabbitMQ/Redis nếu chưa có benchmark/feature cần thiết. | Tech Lead | Sau Core benchmark | PROPOSED |
| T-006 | S3-compatible private object storage, signed URL, size/type validation và malware scanning. | IT + Tech Lead | Phase 2 | PROPOSED |
| T-007 | WMS tích hợp POS/ERP/kế toán qua REST/event có idempotency; endpoint/mapping cụ thể chờ danh sách hệ thống thật. | Product Owner + IT | Phase 1 | PROPOSED – blocked by system inventory |
| T-008 | Report MVP dùng SQL/read model + async CSV/XLSX export; chưa triển khai BI warehouse. | Product Owner + Tech Lead | Trước Phase 9 | PROPOSED |
| T-009 | Structured JSON log, correlation ID, metrics và OpenTelemetry-compatible tracing; vendor cụ thể theo T-001. | Tech Lead/DevOps | Phase 2 | PROPOSED |
| T-010 | Dùng test profile D-107 cho đến khi có số liệu thật; stateless API, worker scale-out, report async. | Product Owner + Tech Lead | Phase 1 | PROPOSED – cần quy mô thật |
| T-011 | Browser support theo thiết bị thực tế; scanner keyboard wedge là baseline, label print qua browser/print service được spike. | Kho + Tech Lead | Phase 1/2 | PROPOSED – site survey |
| T-012 | Backup/PITR theo RPO/RTO D-108; restore rehearsal hàng quý; audit/attachment retention cấu hình và có evidence. | IT + Kế toán | Phase 1/2 | PROPOSED – phụ thuộc D-108 |

---

# 4. Mục bắt buộc stakeholder trả lời

Các phương án dưới đây không nên được coi là mặc định cuối nếu chưa có xác nhận trực tiếp:

1. D-002: Có POS/ERP/phần mềm bán hàng nào đang chạy không?
2. D-005/D-006: Có theo dõi vỏ chai, két, keg, pallet và tiền cọc không; loại nào cần serial?
3. D-007: Reservation bắt đầu lúc nào và hết hạn bao lâu theo từng kênh?
4. D-012: MRSL thực tế khi nhập và xuất cho từng nhóm hàng/kênh?
5. D-013/D-014: Giá vốn và phân bổ chi phí/chiết khấu?
6. D-015: Ngưỡng số lượng/giá trị cần nhiều cấp duyệt?
7. D-016/D-018: Hàng trả, hoàn tiền, tiền cọc và công nợ do hệ thống nào quản lý?
8. D-101: Dung sai nhận dư/thiếu?
9. D-103/D-104: Ngưỡng cảnh báo và ngưỡng kiểm kê/recount?
10. D-107: File dữ liệu thật, số lượng SKU, lô, kho và giao dịch/ngày?
11. D-108: Uptime, RPO/RTO và retention được chấp nhận?
12. D-110/T-004: Kho có bắt buộc hoạt động khi mất mạng không?

---

# 5. Mẫu phê duyệt

| Vai trò | Họ tên | Quyết định/phạm vi | Kết quả | Ngày | Ghi chú |
|---|---|---|---|---|---|
| Product Owner/Sponsor |  | D-001…D-018, MVP scope |  |  |  |
| Quản lý kho |  | Warehouse, UOM, ATP, FEFO, MRSL, Transfer, Stocktake |  |  |  |
| Mua hàng |  | Supplier, PO, tolerance, lead time, inbound MRSL |  |  |  |
| Bán hàng |  | Order source, reservation, outbound MRSL, return |  |  |  |
| Kế toán |  | Cost, deposit, approval, period lock, retention |  |  |  |
| IT/Tech Lead |  | T-001…T-012 |  |  |  |

Phase 1 chỉ đạt Decision Gate khi không còn mục `OPEN`, mọi `PROPOSED` đã chuyển thành `APPROVED`, `REJECTED` kèm phương án thay thế hoặc `DEFERRED_WITH_IMPACT_ACCEPTED` có chữ ký.

