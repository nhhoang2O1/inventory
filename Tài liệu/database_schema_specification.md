# THIẾT KẾ CƠ SỞ DỮ LIỆU CHI TIẾT (DATABASE SCHEMA SPECIFICATION)
## HỆ THỐNG QUẢN LÝ KHO BIA – NƯỚC NGỌT (WMS FMCG v3.1)

Tài liệu này đặc tả chi tiết cấu trúc các bảng, trường thông tin, kiểu dữ liệu, khóa ngoại và các ràng buộc (constraints) tối giản, đảm bảo chuẩn hóa dữ liệu tối đa, loại bỏ hoàn toàn các trường tính toán hoặc các trường ít sử dụng để tiết kiệm bộ nhớ và tăng hiệu năng truy vấn.

---

## 1. Phân hệ Identity & Access Management (IAM - Phân quyền)

### 1.1. Bảng `users` (Người dùng)
*Lưu tài khoản đăng nhập của nhân viên.*
*Tích hợp trực tiếp `role_id` vào bảng này vì 1 nhân viên chỉ giữ duy nhất 1 vai trò tại một thời điểm, giúp loại bỏ hoàn toàn bảng trung gian `user_roles`.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID duy nhất |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Tên đăng nhập |
| `password_hash` | VARCHAR(255) | NOT NULL | Mật khẩu băm bảo mật |
| `full_name` | VARCHAR(100) | NOT NULL | Họ và tên |
| `role_id` | UUID | FK -> `roles.id`, NOT NULL | Vai trò của người dùng (Thủ kho, Kế toán, Manager...) |
| `status` | ENUM('ACTIVE', 'INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | Trạng thái người dùng |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày tạo tài khoản |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật thông tin gần nhất |
| `deleted_at` | TIMESTAMP | NULL | Xóa mềm tài khoản |

### 1.2. Bảng `roles` (Vai trò)
*Nhóm các quyền hạn.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID vai trò |
| `role_code` | VARCHAR(30) | UNIQUE, NOT NULL | Mã vai trò (ví dụ: `STOREKEEPER`, `ACCOUNTANT`) |
| `name` | VARCHAR(50) | NOT NULL | Tên vai trò hiển thị |

### 1.3. Bảng `permissions` (Quyền hạn)
*Định nghĩa các hành động cụ thể.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID quyền |
| `permission_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã quyền (ví dụ: `FEFO_OVERRIDE`, `PO_APPROVE`) |
| `name` | VARCHAR(100) | NOT NULL | Tên quyền |

### 1.4. Bảng `role_permissions` (Liên kết vai trò - quyền)
*Bảng trung gian N-N để cấu hình danh sách quyền hạn cho từng vai trò.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `role_id` | UUID | PK, FK -> `roles.id` | ID vai trò |
| `permission_id` | UUID | PK, FK -> `permissions.id` | ID quyền |

### 1.5. Bảng `user_warehouse_scopes` (Giới hạn kho của nhân viên)
*Giới hạn chi nhánh/kho làm việc.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `user_id` | UUID | PK, FK -> `users.id` | ID người dùng |
| `warehouse_id` | UUID | PK, FK -> `warehouses.id` | ID kho hàng |

---

## 2. Phân hệ Danh mục sản phẩm & Đối tác (Master Data)

### 2.1. Bảng `company_profile` (Thông tin Doanh nghiệp của bạn)
*Vai trò: Lưu thông tin công ty chủ quản để tự động xuất hóa đơn tài chính và tờ khai thuế.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID duy nhất |
| `company_name` | VARCHAR(200) | NOT NULL | Tên đầy đủ doanh nghiệp (theo giấy phép ĐKKD) |
| `tax_code` | VARCHAR(14) | NOT NULL, UNIQUE | Mã số thuế doanh nghiệp (định dạng 10 hoặc 14 số) |
| `address` | TEXT | NOT NULL | Địa chỉ trụ sở chính (theo GPKD) |
| `phone` | VARCHAR(20) | | Số điện thoại liên hệ |

### 2.2. Bảng `tax_groups` (Nhóm thuế suất)
*Vai trò: Lưu cấu hình thuế suất GTGT và Thuế tiêu thụ đặc biệt theo thời gian pháp lý.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID nhóm thuế |
| `tax_group_code` | VARCHAR(30) | UNIQUE, NOT NULL | Mã nhóm thuế (ví dụ: `BIA-TTDB65-VAT10`) |
| `name` | VARCHAR(100) | NOT NULL | Tên nhóm thuế hiển thị |
| `vat_rate` | NUMERIC(5, 2) | NOT NULL, DEFAULT 10.00 | Thuế suất Giá trị Gia tăng (%) |
| `excise_tax_rate` | NUMERIC(5, 2) | NOT NULL, DEFAULT 0.00 | Thuế suất Thuế Tiêu thụ Đặc biệt (%) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày tạo nhóm thuế |

### 2.3. Bảng `customers` (Danh mục Khách hàng / Đối tác mua hàng)
*Vai trò: Lưu thông tin đối tác mua hàng phục vụ xuất hóa đơn và đối chiếu nợ vỏ.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID đối tác |
| `customer_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã khách hàng (ví dụ: `KH-WINMART`) |
| `buyer_company_name` | VARCHAR(200) | | Tên đơn vị mua hàng (nếu là doanh nghiệp) |
| `buyer_name` | VARCHAR(100) | NOT NULL | Tên người mua hàng đại diện |
| `buyer_tax_code` | VARCHAR(14) | | Mã số thuế của người mua (VARCHAR(14)) |
| `buyer_address` | TEXT | | Địa chỉ của người mua |
| `buyer_email_invoice`| VARCHAR(100) | | Email nhận hóa đơn điện tử |
| `status` | ENUM('ACTIVE', 'INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | Trạng thái hoạt động |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày tạo khách hàng |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày sửa đổi thông tin |
| `deleted_at` | TIMESTAMP | NULL | Xóa mềm khách hàng |

### 2.4. Bảng `products` (Sản phẩm thương mại)
*Khái niệm sản phẩm chung. Đã chuẩn hóa danh mục và liên kết thuế.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID sản phẩm |
| `product_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã sản phẩm (ví dụ: `SP-HEINEKEN-SILVER`) |
| `name` | VARCHAR(150) | NOT NULL | Tên sản phẩm thương mại |
| `brand` | VARCHAR(50) | NOT NULL | Thương hiệu |
| `category` | ENUM('ALCOHOL', 'SOFT_DRINK') | NOT NULL | Phân loại sản phẩm (Ép chuẩn dữ liệu) |
| `unit` | VARCHAR(20) | NOT NULL | Đơn vị tính gốc/chính (ví dụ: Lon, Chai) |
| `abv` | NUMERIC(4, 2) | CHECK(`abv` >= 0) | Nồng độ cồn (% độ cồn, ví dụ: 4.00) |
| `tax_group_id` | UUID | FK -> `tax_groups.id`, NOT NULL | Liên kết nhóm thuế suất áp dụng |
| `hs_code` | VARCHAR(20) | | Mã HS (khai hải quan & thuế) |
| `registration_number`| VARCHAR(100) | | Số tự công bố sản phẩm (Nghị định 15/2018/NĐ-CP) |
| `origin_country` | VARCHAR(50) | DEFAULT 'Vietnam' | Nước xuất xứ / Nước sản xuất |
| `manufacturer_name` | VARCHAR(150) | NOT NULL | Tên công ty sản xuất (đối chiếu nguồn gốc) |
| `status` | ENUM('ACTIVE', 'INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | Trạng thái kinh doanh |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian tạo sản phẩm |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian cập nhật gần nhất |
| `deleted_at` | TIMESTAMP | NULL | Xóa mềm sản phẩm |

### 2.5. Bảng `skus` (Biến thể/Mã hàng tồn kho - Đơn vị lưu kho vật lý)
*Đơn vị quản lý tồn kho trực tiếp. Mỗi SKU đại diện cho một quy cách đóng gói vật lý (Thùng/Két/Keg) được quét nhập/xuất thực tế.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID SKU |
| `product_id` | UUID | FK -> `products.id`, NOT NULL | Thuộc sản phẩm nào |
| `sku_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã SKU (ví dụ: `SKU-HN-SILVER-THUNG`) |
| `name` | VARCHAR(150) | NOT NULL | Tên SKU chi tiết (ví dụ: "Thùng Heineken Silver 24 lon 330ml") |
| `base_uom` | VARCHAR(20) | NOT NULL, CHECK(`base_uom` IN ('THUNG', 'KET', 'KEG', 'CHAI', 'LON')) | Đơn vị lưu kho (THUNG, KET, KEG, CHAI, LON) |
| `packaging_specification`| INT | NOT NULL, DEFAULT 24, CHECK(`packaging_specification` > 0) | Quy cách đóng gói: Số lượng chai/lon lẻ trong 1 đơn vị lưu kho (ví dụ: 24 lon/thùng) |
| `volume_ml` | INT | NOT NULL, CHECK(`volume_ml` > 0) | Dung tích của 1 đơn vị chai/lon lẻ (ml) để quy đổi tổng lít bia nộp thuế |
| `weight_g` | INT | CHECK(`weight_g` > 0) | Trọng lượng cả bao bì của 1 đơn vị lưu kho (g) |
| `has_expiry` | BOOLEAN | DEFAULT TRUE | Cờ quản lý HSD (bật để hệ thống kiểm soát FEFO) |
| `status` | ENUM('ACTIVE', 'INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | Trạng thái SKU |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian tạo SKU |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian sửa đổi SKU |
| `deleted_at` | TIMESTAMP | NULL | Xóa mềm SKU |


### 2.7. Bảng `barcodes` (Mã vạch)
*Barcode của đơn vị lưu kho.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID mã vạch |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU tương ứng |
| `barcode` | VARCHAR(50) | UNIQUE, NOT NULL | Mã vạch quét thực tế trên thùng/két/keg |

### 2.8. Bảng `suppliers` (Nhà cung cấp)
*Thông tin đối tác mua hàng.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID nhà cung cấp |
| `supplier_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã nhà cung cấp |
| `name` | VARCHAR(150) | NOT NULL | Tên nhà cung cấp |
| `phone` | VARCHAR(20) | | Số điện thoại |
| `standard_lead_time_days` | INT | DEFAULT 0 | Lead time chuẩn (ngày) |
| `status` | ENUM('ACTIVE', 'INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | Trạng thái nhà cung cấp |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày tạo nhà cung cấp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật thông tin |
| `deleted_at` | TIMESTAMP | NULL | Xóa mềm nhà cung cấp |

---

## 3. Phân hệ Layout Kho hàng (Sơ đồ Kho)

### 3.1. Bảng `warehouses` (Kho hàng)
*Danh sách kho.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID kho |
| `warehouse_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã kho (ví dụ: `KHO-A`) |
| `name` | VARCHAR(150) | NOT NULL | Tên kho |

### 3.2. Bảng `zones` (Phân khu kho)
*Phân khu thuộc kho.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID zone |
| `warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Thuộc kho nào |
| `zone_code` | VARCHAR(50) | NOT NULL | Mã zone (ví dụ: `ZONE-LANH`) |
| `name` | VARCHAR(100) | NOT NULL | Tên zone |
| | | UNIQUE(`warehouse_id`, `zone_code`) | Tránh trùng zone trong kho |

### 3.3. Bảng `locations` (Vị trí ô chứa chi tiết)
*Định vị ô chứa trong phân khu.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID vị trí |
| `zone_id` | UUID | FK -> `zones.id`, NOT NULL | Thuộc zone nào |
| `location_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã vị trí quét barcode (ví dụ: `A-01-02-03`) |
| `mixing_policy` | VARCHAR(30) | NOT NULL | Chính sách để hàng: `SINGLE_SKU`, `SINGLE_BATCH`, `MIXED` |
| `status` | VARCHAR(20) | NOT NULL | Trạng thái vị trí: `AVAILABLE`, `LOCKED_COUNTING` |

---

## 4. Phân hệ Lô hàng & Số dư Tồn kho

### 4.1. Bảng `batches` (Lô sản xuất)
*Hạn dùng và ngày sản xuất.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID lô |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU của lô |
| `batch_code` | VARCHAR(50) | NOT NULL | Mã lô sản xuất |
| `mfg_date` | DATE | NOT NULL | Ngày sản xuất |
| `exp_date` | DATE | NOT NULL | Hạn sử dụng |
| | | UNIQUE(`sku_id`, `batch_code`) | Tránh trùng lô cho cùng một SKU |
| | | CHECK(`exp_date` > `mfg_date`) | HSD phải sau NSX |

### 4.2. Bảng `inventory_balances` (Số dư tồn kho vật lý - On-hand)
*Lưu số lượng tồn thực tế đã ghi sổ (theo Thùng/Két/Keg).*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID bản ghi số dư |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | Mã SKU |
| `batch_id` | UUID | FK -> `batches.id` | Lô hàng (NULL nếu là POSM/quà tặng) |
| `location_id` | UUID | FK -> `locations.id`, NOT NULL | Vị trí chứa hàng |
| `stock_status` | VARCHAR(30) | NOT NULL | Trạng thái: `AVAILABLE`, `QUARANTINED`, `DAMAGED`, `EXPIRED`, `BLOCKED`, `RECALLED` |
| `quantity` | INT | NOT NULL, CHECK(`quantity` >= 0) | Số lượng tồn hiện tại (theo đơn vị lưu kho, ví dụ: số Thùng) |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật gần nhất |
| | | UNIQUE(`sku_id`, `batch_id`, `location_id`, `stock_status`) | Khóa số dư duy nhất |

### 4.3. Bảng `inventory_reservations` (Sổ giữ hàng trước - Reservation)
*Giữ hàng phục vụ tính ATP và chống xuất trùng đơn.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID giữ hàng |
| `demand_source_type` | VARCHAR(50) | NOT NULL | Loại đơn hàng: `SALES_ORDER`, `STOCK_TRANSFER` |
| `demand_source_id` | UUID | NOT NULL | ID đơn hàng tham chiếu |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU giữ |
| `warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Giữ tại kho nào (bắt buộc vì location có thể chưa gán) |
| `batch_id` | UUID | FK -> `batches.id` | Lô được gán (NULL nếu giữ ở mức kho chung) |
| `location_id` | UUID | FK -> `locations.id` | Vị trí được gán (NULL nếu chưa allocation) |
| `quantity` | INT | NOT NULL, CHECK(`quantity` > 0) | Số lượng giữ (theo đơn vị lưu kho) |
| `status` | VARCHAR(20) | NOT NULL | Trạng thái: `ACTIVE`, `FULFILLED`, `CANCELLED` |
| `expires_at` | TIMESTAMP | NOT NULL | Thời gian hết hạn tạm giữ |
| `idempotency_key` | VARCHAR(100) | UNIQUE, NOT NULL | Tránh gửi trùng yêu cầu giữ hàng |
| `version` | INT | DEFAULT 1 | Dùng chống ghi đè đồng thời (Optimistic Lock) |

### 4.4. Bảng `inventory_movement_ledger` (Sổ cái giao dịch kho - Transaction)
*Lịch sử thay đổi số dư tồn kho làm cơ sở đối chiếu.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | BIGSERIAL | PK | ID giao dịch tự tăng |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | Mã SKU |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Mã Lô |
| `location_id` | UUID | FK -> `locations.id`, NOT NULL | Vị trí phát sinh thay đổi |
| `transaction_type` | VARCHAR(50) | NOT NULL | Phân loại: `INBOUND`, `OUTBOUND`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`, `STATUS_CHANGE` |
| `document_type` | VARCHAR(50) | NOT NULL | Loại chứng từ gốc: `GOODS_RECEIPT`, `GOODS_ISSUE` |
| `document_id` | UUID | NOT NULL | ID chứng từ liên kết |
| `quantity_delta` | INT | NOT NULL | Số lượng thay đổi (+ tăng, - giảm theo đơn vị lưu kho) |
| `stock_status_from` | VARCHAR(30) | | Trạng thái gốc (khi đổi chất lượng) |
| `stock_status_to` | VARCHAR(30) | | Trạng thái đích |
| `actor_id` | UUID | FK -> `users.id`, NOT NULL | Người thực hiện |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày thực hiện |

### 4.5. Bảng `mrsl_policies` (Chính sách hạn còn lại tối thiểu)
*Định nghĩa điều kiện nhập/xuất theo HSD.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID chính sách |
| `policy_name` | VARCHAR(100) | NOT NULL | Tên chính sách |
| `direction` | VARCHAR(20) | NOT NULL | Chiều áp dụng: `INBOUND`, `OUTBOUND` |
| `sku_id` | UUID | FK -> `skus.id` | SKU áp dụng (NULL nếu áp dụng cho toàn bộ) |
| `supplier_id` | UUID | FK -> `suppliers.id` | Nhà cung cấp áp dụng |
| `min_remaining_days` | INT | NOT NULL, CHECK(`min_remaining_days` >= 0) | Số ngày còn lại tối thiểu |
| `action_on_violation` | VARCHAR(30) | NOT NULL | Hành động: `REJECT`, `QUARANTINE`, `ALLOW_WITH_APPROVAL` |
| `start_date` | DATE | NOT NULL | Ngày áp dụng |
| `end_date` | DATE | | Ngày hết hạn |

---

## 5. Phân hệ Mua hàng & Nhập kho (Inbound)

### 5.1. Bảng `purchase_orders` (Đơn mua hàng)
*Đơn đặt hàng nhà cung cấp.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID đơn mua |
| `po_code` | VARCHAR(50) | UNIQUE, NOT NULL | Số đơn mua PO duy nhất |
| `supplier_id` | UUID | FK -> `suppliers.id`, NOT NULL | Nhà cung cấp |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SENT`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CLOSED`, `CANCELLED` |
| `order_date` | DATE | NOT NULL | Ngày đặt hàng |
| `expected_delivery_date`| DATE | NOT NULL | Ngày dự kiến giao (Order Date + Lead Time) |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Người tạo đơn |

### 5.2. Bảng `purchase_order_lines` (Chi tiết đơn mua)
*Dòng SKU và số lượng mua.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng đơn mua |
| `po_id` | UUID | FK -> `purchase_orders.id`, NOT NULL | Thuộc PO nào |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU đặt mua (Thùng/Két) |
| `ordered_qty` | INT | NOT NULL, CHECK(`ordered_qty` > 0) | Số lượng đặt (theo đơn vị lưu kho) |
| `received_qty` | INT | DEFAULT 0 | Số lượng đã nhận |
| `uom` | VARCHAR(20) | NOT NULL | Đơn vị tính lưu kho (THUNG/KET/KEG...) |
| `unit_price` | NUMERIC(18, 4) | NOT NULL | Giá mua chưa VAT & thuế TTĐB |
| `vat_rate` | NUMERIC(5, 2) | NOT NULL | Thuế suất VAT áp dụng (%) (ảnh chụp lịch sử) |
| `excise_tax_rate` | NUMERIC(5, 2) | DEFAULT 0.00 | Thuế suất tiêu thụ đặc biệt (%) (ảnh chụp lịch sử) |

### 5.3. Bảng `goods_receipts` (Phiếu nhập kho)
*Ghi nhận hàng thực tế nhập.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID phiếu nhập |
| `gr_code` | VARCHAR(50) | UNIQUE, NOT NULL | Số phiếu nhập |
| `po_id` | UUID | FK -> `purchase_orders.id` | Liên kết PO (NULL nếu nhập ngoài) |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `RECEIVING`, `POSTED`, `CANCELLED` |
| `received_date` | TIMESTAMP | NOT NULL | Ngày nhận thực tế |
| `received_by` | UUID | FK -> `users.id`, NOT NULL | Người nhận hàng |
| `idempotency_key` | VARCHAR(100) | UNIQUE, NOT NULL | Chống trùng lặp gửi request |

### 5.4. Bảng `goods_receipt_lines` (Chi tiết phiếu nhập kho)
*Chi tiết số lượng thực tế nhận theo lô và vị trí.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng nhập |
| `gr_id` | UUID | FK -> `goods_receipts.id`, NOT NULL | Thuộc phiếu nhập nào |
| `po_line_id` | UUID | FK -> `purchase_order_lines.id` | Liên kết dòng PO gốc |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU nhận |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô hàng |
| `quantity` | INT | NOT NULL, CHECK(`quantity` > 0) | Số lượng thực tế nhận (theo đơn vị lưu kho) |
| `uom` | VARCHAR(20) | NOT NULL | Đơn vị tính nhận (THUNG/KET/KEG...) |
| `location_id` | UUID | FK -> `locations.id`, NOT NULL | Vị trí cất hàng |
| `stock_status` | VARCHAR(30) | NOT NULL | Phân bổ vào: `AVAILABLE` hoặc `QUARANTINED` |

---

## 6. Phân hệ Bán hàng & Hóa đơn xuất kho (Outbound & Tax Invoicing)

### 6.1. Bảng `sales_orders` (Đơn bán hàng & Thông tin Hóa đơn điện tử)
*Đơn đặt hàng và thông tin khai báo thuế.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID đơn bán |
| `so_code` | VARCHAR(50) | UNIQUE, NOT NULL | Số đơn SO duy nhất |
| `customer_id` | UUID | FK -> `customers.id`, NOT NULL | Khách hàng mua hàng |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `SUBMITTED`, `APPROVED`, `ALLOCATED`, `PICKING`, `POSTED`, `CANCELLED` |
| `order_date` | DATE | NOT NULL | Ngày lập đơn hàng |
| `invoice_date` | TIMESTAMP | | Ngày thực tế xuất hóa đơn điện tử / xuất kho |
| `invoice_number` | VARCHAR(50) | | Số hóa đơn điện tử do cơ quan thuế/hệ thống cấp |
| `invoice_symbol` | VARCHAR(20) | | Ký hiệu hóa đơn tài chính theo Thông tư 78 (Ví dụ: `1C22TAA`) |
| `payment_method` | VARCHAR(50) | | Hình thức thanh toán bắt buộc khai báo thuế (Tiền mặt, Chuyển khoản...) |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Nhân viên tạo đơn |

### 6.2. Bảng `sales_order_lines` (Chi tiết đơn bán - Sổ cái đóng băng dữ liệu thuế)
*Đặc tả dòng hàng đã bán.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng đơn bán |
| `so_id` | UUID | FK -> `sales_orders.id`, NOT NULL | Thuộc SO nào |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU sản phẩm |
| `product_name` | VARCHAR(150) | NOT NULL | Tên sản phẩm đầy đủ lúc xuất hóa đơn (ví dụ: "Bia Heineken Silver Lon 330ml") |
| `unit` | VARCHAR(50) | NOT NULL | Tên ĐVT lúc bán (Thùng/Két) |
| `quantity` | INT | NOT NULL, CHECK(`quantity` > 0) | Số lượng bán (theo đơn vị lưu kho) |
| `unit_price` | NUMERIC(18, 4) | NOT NULL | Đơn giá bán chưa bao gồm thuế (VAT & TTĐB) |
| `discount_amount` | NUMERIC(18, 4) | DEFAULT 0.0000 | Số tiền chiết khấu, giảm giá cho dòng hàng (nếu có) |
| `vat_rate` | NUMERIC(5, 2) | NOT NULL | Thuế suất VAT (%) (ảnh chụp lịch sử) |
| `excise_tax_rate` | NUMERIC(5, 2) | DEFAULT 0.00 | Thuế suất tiêu thụ đặc biệt (%) (ảnh chụp lịch sử) |

> [!NOTE]
> **Công thức tính toán động ra Đơn vị Tiêu dùng (Lon/Chai) và Thể tích (Lít) phục vụ báo cáo thuế:**
> * Lấy `packaging_specification` (Quy cách) và `volume_ml` (Dung tích lon lẻ) từ bảng `skus` thông qua `sku_id` của dòng hàng.
> * $\text{Tổng số lon/chai} = \text{quantity} \times \text{packaging\_specification}$
> * $\text{Tổng thể tích (Lít)} = \text{quantity} \times \text{packaging\_specification} \times \frac{\text{volume\_ml}}{1000}$
> * $\text{VAT Amount} = (\text{quantity} \times \text{unit\_price} - \text{discount\_amount}) \times \frac{\text{vat\_rate}}{100}$
> * $\text{Excise Tax Amount} = (\text{quantity} \times \text{unit\_price} - \text{discount\_amount}) \times \frac{\text{excise\_tax\_rate}}{100}$

### 6.3. Bảng `goods_issues` (Phiếu xuất kho thực tế)
*Ghi nhận xuất kho vật lý.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID phiếu xuất |
| `gi_code` | VARCHAR(50) | UNIQUE, NOT NULL | Số phiếu xuất |
| `so_id` | UUID | FK -> `sales_orders.id` | Liên kết SO (NULL nếu xuất ngoài) |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `PICKING`, `POSTED`, `CANCELLED` |
| `issued_date` | TIMESTAMP | NOT NULL | Ngày xuất thực tế |
| `issued_by` | UUID | FK -> `users.id`, NOT NULL | Thủ kho xuất hàng |
| `idempotency_key` | VARCHAR(100) | UNIQUE, NOT NULL | Chống trùng lặp gửi request |

### 6.4. Bảng `goods_issue_lines` (Chi tiết phiếu xuất kho)
*Lô và vị trí lấy hàng thực tế.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng xuất |
| `gi_id` | UUID | FK -> `goods_issues.id`, NOT NULL | Thuộc phiếu xuất nào |
| `so_line_id` | UUID | FK -> `sales_order_lines.id` | Liên kết dòng SO |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU xuất |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô hàng xuất (chọn theo FEFO) |
| `quantity` | INT | NOT NULL, CHECK(`quantity` > 0) | Số lượng xuất thực tế (theo đơn vị lưu kho) |
| `uom` | VARCHAR(20) | NOT NULL | Đơn vị tính xuất (THUNG/KET/KEG...) |
| `location_id` | UUID | FK -> `locations.id`, NOT NULL | Vị trí lấy hàng |

---

## 7. Phân hệ Trung chuyển & Trả hàng

### 7.1. Bảng `stock_transfers` (Yêu cầu chuyển kho)
*Luân chuyển hàng giữa các kho.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID chuyển kho |
| `transfer_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã chuyển kho |
| `from_warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Kho xuất |
| `to_warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Kho nhận |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `APPROVED`, `SHIPPED` (đang đi đường), `RECEIVED`, `CLOSED`, `CANCELLED` |
| `shipped_at` | TIMESTAMP | | Ngày xuất kho nguồn |
| `received_at` | TIMESTAMP | | Ngày nhập kho đích |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Người yêu cầu |

### 7.2. Bảng `stock_transfer_lines` (Chi tiết chuyển kho)

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng chuyển |
| `transfer_id` | UUID | FK -> `stock_transfers.id`, NOT NULL | Thuộc lệnh chuyển nào |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU chuyển |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô hàng chuyển |
| `requested_qty` | INT | NOT NULL, CHECK(`requested_qty` > 0) | Lượng yêu cầu (đơn vị lưu kho) |
| `shipped_qty` | INT | DEFAULT 0 | Lượng đã thực xuất tại nguồn |
| `received_qty` | INT | DEFAULT 0 | Lượng đã thực nhận tại đích |
| `uom` | VARCHAR(20) | NOT NULL | Đơn vị tính trung chuyển (THUNG/KET/KEG...) |

### 7.3. Bảng `customer_returns` (Khách hàng trả hàng)
*Ghi nhận hàng trả.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID phiếu trả |
| `return_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã phiếu trả |
| `so_id` | UUID | FK -> `sales_orders.id` | Tham chiếu đơn SO cũ |
| `warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Trả về kho nào |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `QUARANTINED`, `PROCESSED`, `CLOSED` |
| `returned_date` | TIMESTAMP | NOT NULL | Ngày nhận trả |
| `received_by` | UUID | FK -> `users.id`, NOT NULL | Người nhận |

### 7.4. Bảng `customer_return_lines` (QC kiểm định & Quyết định xử lý)
*Phân loại hàng trả, lưu thông tin QC kiểm định.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng trả |
| `return_id` | UUID | FK -> `customer_returns.id`, NOT NULL | Thuộc phiếu trả nào |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU trả |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô trả |
| `quantity` | INT | NOT NULL, CHECK(`quantity` > 0) | Số lượng trả (đơn vị lưu kho) |
| `uom` | VARCHAR(20) | NOT NULL | Đơn vị tính nhận trả (THUNG/KET/KEG...) |
| `return_type` | VARCHAR(30) | NOT NULL | Phân loại: `GOOD`, `DAMAGE`, `EXPIRED`, `RECALL` |
| `qc_status` | VARCHAR(30) | NOT NULL | Trạng thái QC: `PENDING`, `PASSED`, `FAILED` |
| `disposition` | VARCHAR(30) | | Quyết định: `RESTOCK`, `DESTROY`, `SUPPLIER_RETURN` |
| `photo_url` | VARCHAR(255) | | Link ảnh chụp lỗi hỏng làm bằng chứng |

---

## 8. Phân hệ Bao bì hoàn trả (Quản lý Vỏ cọc)

### 8.1. Bảng `returnable_container_types` (Danh mục vỏ két/bao bì cọc)
*Danh mục vỏ két, keg, vỏ chai.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID bao bì |
| `container_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã bao bì (ví dụ: `KET-HN-SILVER`) |
| `name` | VARCHAR(100) | NOT NULL | Tên vỏ bao bì |
| `deposit_value` | NUMERIC(18, 4) | DEFAULT 0.0000 | Giá trị đặt cọc/vỏ két |

### 8.2. Bảng `container_balances_by_party` (Sổ nợ vỏ cọc đối tác)
*Theo dõi số két/vỏ cọc mà đối tác đang cầm giữ.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID số dư |
| `party_type` | VARCHAR(20) | NOT NULL | Loại: `CUSTOMER`, `SUPPLIER` |
| `party_id` | UUID | NOT NULL | ID khách hàng hoặc nhà cung cấp tương ứng |
| `container_type_id` | UUID | FK -> `returnable_container_types.id`, NOT NULL | Loại vỏ cọc |
| `quantity_held` | INT | NOT NULL, DEFAULT 0 | Số lượng đang giữ (số lượng âm nghĩa là đối tác trả dư vỏ) |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật |
| | | UNIQUE(`party_type`, `party_id`, `container_type_id`) | Khóa duy nhất |

### 8.3. Bảng `container_movement_ledger` (Nhật ký giao nhận vỏ cọc)

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | BIGSERIAL | PK | ID tự tăng |
| `party_type` | VARCHAR(20) | NOT NULL | Loại đối tác |
| `party_id` | UUID | NOT NULL | ID đối tác |
| `container_type_id` | UUID | FK -> `returnable_container_types.id`, NOT NULL | Loại vỏ |
| `qty_out` | INT | DEFAULT 0 | Giao đi (Khách nợ thêm) |
| `qty_in` | INT | DEFAULT 0 | Trả về (Khách hoàn trả) |
| `qty_damaged` | INT | DEFAULT 0 | Vỏ bị hỏng ghi nhận |
| `deposit_delta` | NUMERIC(18, 4) | NOT NULL | Tiền cọc thay đổi |
| `document_type` | VARCHAR(50) | NOT NULL | Từ chứng từ: `GOODS_ISSUE`, `CUSTOMER_RETURN` |
| `document_id` | UUID | NOT NULL | ID chứng từ gốc |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày giao dịch |

---

## 9. Phân hệ Kiểm kê, Điều chỉnh & Thu hồi (Recall)

### 9.1. Bảng `stock_counts` (Đợt kiểm kê)
*Phiên kiểm kê.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID đợt kiểm kê |
| `count_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã đợt |
| `warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Tại kho nào |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `PLANNED`, `COUNTING`, `PENDING_APPROVAL`, `POSTED`, `CANCELLED` |
| `snapshot_taken_at` | TIMESTAMP | | Thời gian chốt snapshot tồn kho |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Người tạo |

### 9.2. Bảng `stock_count_lines` (Kết quả kiểm kê)
*Số đếm thực tế so với snapshot hệ thống.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng kiểm kê |
| `stock_count_id` | UUID | FK -> `stock_counts.id`, NOT NULL | Thuộc đợt nào |
| `location_id` | UUID | FK -> `locations.id`, NOT NULL | Tại vị trí nào |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU kiểm |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô kiểm |
| `stock_status` | VARCHAR(30) | NOT NULL | Trạng thái hàng |
| `system_qty` | INT | NOT NULL | Tồn snapshot hệ thống (theo đơn vị lưu kho) |
| `counted_qty` | INT | | Tồn đếm thực tế (theo đơn vị lưu kho) |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái dòng: `PENDING`, `COMPLETED` |

### 9.3. Bảng `inventory_adjustments` (Phiếu điều chỉnh tồn kho)
*Điều chỉnh tăng/giảm tồn.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID phiếu điều chỉnh |
| `adj_code` | VARCHAR(50) | UNIQUE, NOT NULL | Số phiếu điều chỉnh |
| `warehouse_id` | UUID | FK -> `warehouses.id`, NOT NULL | Điều chỉnh tại kho |
| `reason` | TEXT | NOT NULL | Lý do |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `APPROVED`, `POSTED`, `CANCELLED` |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Người lập |
| `approved_by` | UUID | FK -> `users.id` | Quản lý phê duyệt |

### 9.4. Bảng `inventory_adjustment_lines` (Chi tiết phiếu điều chỉnh)

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID dòng điều chỉnh |
| `adj_id` | UUID | FK -> `inventory_adjustments.id`, NOT NULL | Thuộc phiếu nào |
| `sku_id` | UUID | FK -> `skus.id`, NOT NULL | SKU chỉnh |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô chỉnh |
| `location_id` | UUID | FK -> `locations.id`, NOT NULL | Vị trí chỉnh |
| `stock_status` | VARCHAR(30) | NOT NULL | Trạng thái |
| `qty_delta` | INT | NOT NULL | Lượng tăng giảm (+/- theo đơn vị lưu kho) |

### 9.5. Bảng `recall_cases` (Vụ thu hồi sản phẩm lỗi)
*Chiến dịch thu hồi hàng lỗi.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID vụ thu hồi |
| `recall_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã thu hồi |
| `case_name` | VARCHAR(150) | NOT NULL | Tên chiến dịch |
| `reason` | TEXT | NOT NULL | Lý do lỗi chất lượng |
| `status` | VARCHAR(30) | NOT NULL | Trạng thái: `DRAFT`, `ACTIVE` (Chặn/cô lập), `CONTAINMENT`, `CLOSED` |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Người lập |
| `approved_by` | UUID | FK -> `users.id` | Người duyệt |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Ngày kích hoạt |

### 9.6. Bảng `recall_scopes` (Phạm vi phong tỏa lô thu hồi)
*Chỉ định các lô hàng và kho hàng bị khóa.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | UUID | PK | ID phạm vi |
| `recall_case_id` | UUID | FK -> `recall_cases.id`, NOT NULL | Thuộc chiến dịch nào |
| `batch_id` | UUID | FK -> `batches.id`, NOT NULL | Lô hàng bị khóa thu hồi |
| `warehouse_id` | UUID | FK -> `warehouses.id` | Kho bị ảnh hưởng (NULL là áp dụng toàn hệ thống) |

---

## 10. Phân hệ Nhật ký thao tác (Audit Log)

### 10.1. Bảng `audit_logs` (Nhật ký hệ thống)
*Ghi chép lịch sử thao tác. Append-only, không cho phép Update/Delete.*

| Tên trường (Column) | Kiểu dữ liệu (Type) | Ràng buộc (Constraint) | Mô tả |
|---|---|---|---|
| `id` | BIGSERIAL | PK | ID tự tăng |
| `actor_id` | UUID | FK -> `users.id` | Người thực hiện |
| `role_code` | VARCHAR(30) | | Vai trò của người thực hiện lúc đó |
| `action` | VARCHAR(50) | NOT NULL | Hành động: `CREATE`, `UPDATE`, `POST`, `OVERRIDE_FEFO` |
| `entity_name` | VARCHAR(50) | NOT NULL | Tên bảng bị tác động |
| `entity_id` | VARCHAR(100) | NOT NULL | ID bản ghi bị tác động |
| `old_values` | JSONB | | Ảnh dữ liệu cũ trước khi thay đổi |
| `new_values` | JSONB | | Ảnh dữ liệu mới sau khi thay đổi |
| `ip_address` | VARCHAR(45) | NOT NULL | IP máy khách |
| `request_id` | VARCHAR(100) | NOT NULL | ID request đồng bộ hệ thống |
| `reason` | TEXT | | Lý do (bắt buộc khi ghi đè hoặc điều chỉnh) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời gian sự kiện |
