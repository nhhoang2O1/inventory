-- Migration 0020: Single Centralized Warehouse Complex (Bãi Kho Tập Trung CITARES)

-- 1. Create or ensure Centralized Warehouse Complex
INSERT INTO warehouse.warehouse (code, name, warehouse_type, status)
VALUES ('KHO-CITARES', 'Bãi Kho Tập Trung CITARES', 'PHYSICAL', 'ACTIVE')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

-- 2. Create the 6 Sheds / Zones (A, B, C, D, E, F)
DO $$
DECLARE
  v_wh_id uuid;
  v_zone_a uuid;
  v_zone_b uuid;
  v_zone_c uuid;
  v_zone_d uuid;
  v_zone_e uuid;
  v_zone_f uuid;
BEGIN
  SELECT id INTO v_wh_id FROM warehouse.warehouse WHERE code = 'KHO-CITARES';

  -- Upsert Zone A
  INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
  VALUES (v_wh_id, 'ZONE-KHO-A', 'Nhà Kho A (Bia Chai & Bia Lon)', 'STORAGE', 'ACTIVE')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_zone_a;
  IF v_zone_a IS NULL THEN SELECT id INTO v_zone_a FROM warehouse.zone WHERE warehouse_id = v_wh_id AND code = 'ZONE-KHO-A'; END IF;

  -- Upsert Zone B
  INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
  VALUES (v_wh_id, 'ZONE-KHO-B', 'Nhà Kho B (Nước Ngọt & Nước Trái Cây)', 'STORAGE', 'ACTIVE')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_zone_b;
  IF v_zone_b IS NULL THEN SELECT id INTO v_zone_b FROM warehouse.zone WHERE warehouse_id = v_wh_id AND code = 'ZONE-KHO-B'; END IF;

  -- Upsert Zone C
  INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
  VALUES (v_wh_id, 'ZONE-KHO-C', 'Nhà Kho C (Bia Keg & Thùng Rượu)', 'STORAGE', 'ACTIVE')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_zone_c;
  IF v_zone_c IS NULL THEN SELECT id INTO v_zone_c FROM warehouse.zone WHERE warehouse_id = v_wh_id AND code = 'ZONE-KHO-C'; END IF;

  -- Upsert Zone D
  INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
  VALUES (v_wh_id, 'ZONE-KHO-D', 'Nhà Kho D (Vỏ Chai & Két Rỗng)', 'STORAGE', 'ACTIVE')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_zone_d;
  IF v_zone_d IS NULL THEN SELECT id INTO v_zone_d FROM warehouse.zone WHERE warehouse_id = v_wh_id AND code = 'ZONE-KHO-D'; END IF;

  -- Upsert Zone E
  INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
  VALUES (v_wh_id, 'ZONE-KHO-E', 'Nhà Kho E (Kho Chờ Kiểm Định & Cách Ly)', 'QUARANTINE', 'ACTIVE')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_zone_e;
  IF v_zone_e IS NULL THEN SELECT id INTO v_zone_e FROM warehouse.zone WHERE warehouse_id = v_wh_id AND code = 'ZONE-KHO-E'; END IF;

  -- Upsert Zone F
  INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
  VALUES (v_wh_id, 'ZONE-KHO-F', 'Nhà Kho F (Kho Xuất Nhanh & Trung Chuyển)', 'TRANSIT', 'ACTIVE')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_zone_f;
  IF v_zone_f IS NULL THEN SELECT id INTO v_zone_f FROM warehouse.zone WHERE warehouse_id = v_wh_id AND code = 'ZONE-KHO-F'; END IF;

  -- 3. Upsert 12 Locations (2 Docks per Shed: 01 Inbound, 02 Outbound)
  -- Kho A Docks
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_a, 'DOCK-A01', 'BAR-DOCK-A01', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_a, 'DOCK-A02', 'BAR-DOCK-A02', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;

  -- Kho B Docks
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_b, 'DOCK-B01', 'BAR-DOCK-B01', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_b, 'DOCK-B02', 'BAR-DOCK-B02', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;

  -- Kho C Docks
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_c, 'DOCK-C01', 'BAR-DOCK-C01', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_c, 'DOCK-C02', 'BAR-DOCK-C02', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;

  -- Kho D Docks
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_d, 'DOCK-D01', 'BAR-DOCK-D01', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_d, 'DOCK-D02', 'BAR-DOCK-D02', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;

  -- Kho E Docks
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_e, 'DOCK-E01', 'BAR-DOCK-E01', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_e, 'DOCK-E02', 'BAR-DOCK-E02', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;

  -- Kho F Docks
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_f, 'DOCK-F01', 'BAR-DOCK-F01', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;
  INSERT INTO warehouse.location (zone_id, code, barcode, status) VALUES (v_zone_f, 'DOCK-F02', 'BAR-DOCK-F02', 'ACTIVE') ON CONFLICT (zone_id, code) DO NOTHING;

END $$;

-- 4. Seed Gatekeeper Role & Update User Scopes
INSERT INTO iam.role (code, name, is_system, status)
VALUES ('GATEKEEPER', 'Bảo vệ Cổng & Trạm cân', true, 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

-- Map Gatekeeper permissions
INSERT INTO iam.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM iam.role r, iam.permission p
WHERE r.code = 'GATEKEEPER' AND p.code IN ('RECEIVING_POST', 'OUTBOUND_POST')
ON CONFLICT DO NOTHING;

-- Seed / Update Users for Centralized Complex
INSERT INTO iam.app_user (username, display_name, email, role_id, auth_provider, password_hash, status)
SELECT
  'gatekeeper', 'Bảo Vệ Cổng CITARES', 'gatekeeper@citares.vn', r.id, 'LOCAL',
  'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f',
  'ACTIVE'
FROM iam.role r WHERE r.code = 'GATEKEEPER'
ON CONFLICT (username) DO NOTHING;

INSERT INTO iam.app_user (username, display_name, email, role_id, auth_provider, password_hash, status)
SELECT
  'storekeeper', 'Thủ Kho Bãi CITARES', 'storekeeper@citares.vn', r.id, 'LOCAL',
  'c4d1c01fa095bddbaff62277b8a375b2:7deaa80d4ce5954a71c5654c6c9932893f9953fdcb7024d2d1f89dc4cadb576262d3d1b66b1c42b6bf47925ebf641860c2338a7877d87201dc1c087dcf16804f',
  'ACTIVE'
FROM iam.role r WHERE r.code = 'STOREKEEPER'
ON CONFLICT (username) DO NOTHING;

-- Grant KHO-CITARES Scope to all App Users
INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id)
SELECT u.id, w.id
FROM iam.app_user u, warehouse.warehouse w
WHERE w.code = 'KHO-CITARES'
ON CONFLICT DO NOTHING;
