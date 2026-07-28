-- Seeding initial warehouses
INSERT INTO warehouse.warehouse (code, name, status)
VALUES
  ('KHO-CITARES', 'Bãi Kho Tập Trung CITARES', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- Seeding roles
INSERT INTO iam.role (code, name, is_system, status)
VALUES
  ('STOREKEEPER', 'Thủ kho', true, 'ACTIVE'),
  ('MANAGER', 'Quản lý', true, 'ACTIVE'),
  ('ACCOUNTANT', 'Kế toán', true, 'ACTIVE'),
  ('SALES', 'Nhân viên bán hàng', true, 'ACTIVE'),
  ('GATEKEEPER', 'Bảo vệ Cổng & Trạm cân', true, 'ACTIVE')
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

-- Map permissions to roles
INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code = 'MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code IN ('STOREKEEPER', 'GATEKEEPER') AND p.code IN ('RECEIVING_POST', 'OUTBOUND_POST')
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code = 'ACCOUNTANT' AND p.code IN ('COST_VIEW')
ON CONFLICT DO NOTHING;

-- Clean up any existing user warehouse scopes & users to prevent duplicates
DELETE FROM iam.user_warehouse_scope;
DELETE FROM iam.app_user WHERE username IN (
  'manager', 'gatekeeper', 'storekeeper', 'storekeeper_a', 'accountant_a', 'sales_a',
  'storekeeper_b', 'accountant_b', 'sales_b',
  'storekeeper_c', 'accountant_c', 'sales_c'
);

-- Seeding app users with hashed password of '123456'
-- Hashed value: c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f
INSERT INTO iam.app_user (username, display_name, email, role_id, auth_provider, password_hash, status)
VALUES
  -- Global Manager
  ('manager', 'Nguyễn Quản Lý (Tổng)', 'manager@citares.vn', (SELECT id FROM iam.role WHERE code = 'MANAGER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('gatekeeper', 'Bảo Vệ Cổng CITARES', 'gatekeeper@citares.vn', (SELECT id FROM iam.role WHERE code = 'GATEKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('storekeeper', 'Thủ Kho Bãi CITARES', 'storekeeper@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),

  -- Bãi Kho Tập Trung (KHO-CITARES) Users
  ('storekeeper_a', 'Thủ kho CITARES A', 'storekeeper.a@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('accountant_a', 'Kế toán CITARES A', 'accountant.a@citares.vn', (SELECT id FROM iam.role WHERE code = 'ACCOUNTANT'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('sales_a', 'Bán hàng CITARES A', 'sales.a@citares.vn', (SELECT id FROM iam.role WHERE code = 'SALES'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),

  ('storekeeper_b', 'Thủ kho CITARES B', 'storekeeper.b@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('accountant_b', 'Kế toán CITARES B', 'accountant.b@citares.vn', (SELECT id FROM iam.role WHERE code = 'ACCOUNTANT'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('sales_b', 'Bán hàng CITARES B', 'sales.b@citares.vn', (SELECT id FROM iam.role WHERE code = 'SALES'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),

  ('storekeeper_c', 'Thủ kho CITARES C', 'storekeeper.c@citares.vn', (SELECT id FROM iam.role WHERE code = 'STOREKEEPER'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('accountant_c', 'Kế toán CITARES C', 'accountant.c@citares.vn', (SELECT id FROM iam.role WHERE code = 'ACCOUNTANT'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE'),
  ('sales_c', 'Bán hàng CITARES C', 'sales.c@citares.vn', (SELECT id FROM iam.role WHERE code = 'SALES'), 'LOCAL', 'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f', 'ACTIVE')
ON CONFLICT (username) DO NOTHING;

-- Map all users to KHO-CITARES
INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
SELECT u.id, w.id, NOW()
FROM iam.app_user u, warehouse.warehouse w
WHERE w.code = 'KHO-CITARES'
ON CONFLICT DO NOTHING;
