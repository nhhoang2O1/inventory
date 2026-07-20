-- Seeding initial warehouses
INSERT INTO warehouse.warehouse (code, name, status)
VALUES
  ('KHO-A', 'Kho Alpha (Chi nhánh Hà Nội)', 'ACTIVE'),
  ('KHO-B', 'Kho Beta (Chi nhánh TP. HCM)', 'ACTIVE'),
  ('KHO-C', 'Kho Tổng Gamma', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- Seeding roles
INSERT INTO iam.role (code, name, is_system, status)
VALUES
  ('STOREKEEPER', 'Thủ kho', true, 'ACTIVE'),
  ('MANAGER', 'Quản lý', true, 'ACTIVE'),
  ('ACCOUNTANT', 'Kế toán', true, 'ACTIVE'),
  ('SALES', 'Nhân viên bán hàng', true, 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- Seeding permissions
INSERT INTO iam.permission (code, name, status)
VALUES
  ('PO_APPROVE', 'Phê duyệt đơn đặt hàng PO', 'ACTIVE'),
  ('FEFO_OVERRIDE', 'Ghi đè hạn dùng FEFO khi xuất kho', 'ACTIVE'),
  ('RECEIVING_POST', 'Ghi sổ nhập kho', 'ACTIVE'),
  ('OUTBOUND_POST', 'Ghi sổ xuất kho', 'ACTIVE'),
  ('STOCK_COUNT', 'Kích hoạt đợt kiểm kê', 'ACTIVE'),
  ('COST_VIEW', 'Xem báo cáo chi phí và MAC', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- Map permissions to roles (All to MANAGER, specific to others)
INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code = 'MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code = 'STOREKEEPER' AND p.code IN ('RECEIVING_POST', 'OUTBOUND_POST')
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code = 'ACCOUNTANT' AND p.code IN ('COST_VIEW')
ON CONFLICT DO NOTHING;

-- Clean up any existing user warehouse scopes & users to prevent duplicates
DELETE FROM iam.user_warehouse_scope;
DELETE FROM iam.app_user WHERE username IN (
  'manager', 'storekeeper_a', 'accountant_a', 'sales_a',
  'storekeeper_b', 'accountant_b', 'sales_b',
  'storekeeper_c', 'accountant_c', 'sales_c'
);

-- Seeding app users with hashed password of '123456'
-- Hashed value: c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f
INSERT INTO iam.app_user (username, display_name, email, role_id, auth_provider, password_hash, status)
VALUES
  -- Global Manager
  ('manager', 'Nguyễn Quản Lý (Tổng)', 'manager@citares.vn', (SELECT id FROM iam.role WHERE code = 'MANAGER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  
  -- Kho Alpha (KHO-A)
  ('storekeeper_a', 'Thủ kho Alpha', 'storekeeper.a@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('accountant_a', 'Kế toán Alpha', 'accountant.a@citares.vn', (SELECT id FROM iam.role WHERE code = 'ACCOUNTANT'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('sales_a', 'Bán hàng Alpha', 'sales.a@citares.vn', (SELECT id FROM iam.role WHERE code = 'SALES'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),

  -- Kho Beta (KHO-B)
  ('storekeeper_b', 'Thủ kho Beta', 'storekeeper.b@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('accountant_b', 'Kế toán Beta', 'accountant.b@citares.vn', (SELECT id FROM iam.role WHERE code = 'ACCOUNTANT'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('sales_b', 'Bán hàng Beta', 'sales.b@citares.vn', (SELECT id FROM iam.role WHERE code = 'SALES'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),

  -- Kho Tổng Gamma (KHO-C)
  ('storekeeper_c', 'Thủ kho Gamma', 'storekeeper.c@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('accountant_c', 'Kế toán Gamma', 'accountant.c@citares.vn', (SELECT id FROM iam.role WHERE code = 'ACCOUNTANT'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('sales_c', 'Bán hàng Gamma', 'sales.c@citares.vn', (SELECT id FROM iam.role WHERE code = 'SALES'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE')
ON CONFLICT (username) DO NOTHING;

-- Map manager to all 3 warehouses (KHO-A, KHO-B, KHO-C)
INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
SELECT u.id, w.id, NOW()
FROM iam.app_user u, warehouse.warehouse w
WHERE u.username = 'manager'
ON CONFLICT DO NOTHING;

-- Map Kho Alpha users (KHO-A)
INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
SELECT u.id, (SELECT id FROM warehouse.warehouse WHERE code = 'KHO-A'), NOW()
FROM iam.app_user u
WHERE u.username IN ('storekeeper_a', 'accountant_a', 'sales_a')
ON CONFLICT DO NOTHING;

-- Map Kho Beta users (KHO-B)
INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
SELECT u.id, (SELECT id FROM warehouse.warehouse WHERE code = 'KHO-B'), NOW()
FROM iam.app_user u
WHERE u.username IN ('storekeeper_b', 'accountant_b', 'sales_b')
ON CONFLICT DO NOTHING;

-- Map Kho Gamma users (KHO-C)
INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
SELECT u.id, (SELECT id FROM warehouse.warehouse WHERE code = 'KHO-C'), NOW()
FROM iam.app_user u
WHERE u.username IN ('storekeeper_c', 'accountant_c', 'sales_c')
ON CONFLICT DO NOTHING;
