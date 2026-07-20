-- Development/UAT seed only. This file is intentionally outside packages/database/migrations.
-- Password for demo users: WmsDemo2026! Change it immediately. Never run this seed in production.

INSERT INTO warehouse.warehouse (code,name,status) VALUES
  ('KHO-A','Kho Alpha (Chi nhánh Hà Nội)','ACTIVE'),
  ('KHO-B','Kho Beta (Chi nhánh TP. HCM)','ACTIVE'),
  ('KHO-C','Kho Tổng Gamma','ACTIVE')
ON CONFLICT (code) DO UPDATE SET name=excluded.name;

INSERT INTO iam.role (code,name,is_system,status) VALUES
  ('STOREKEEPER','Thủ kho',true,'ACTIVE'),
  ('MANAGER','Quản lý',true,'ACTIVE'),
  ('ACCOUNTANT','Kế toán',true,'ACTIVE'),
  ('SALES','Nhân viên bán hàng',true,'ACTIVE')
ON CONFLICT (code) DO UPDATE SET name=excluded.name,status='ACTIVE';

-- Canonical permissions are created by module migrations. UAT manager receives all;
-- other roles receive only the permissions needed by their demo workflow.
INSERT INTO iam.role_permission (role_id,permission_id)
SELECT role.id,permission.id FROM iam.role role CROSS JOIN iam.permission permission
WHERE role.code='MANAGER' ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id,permission_id)
SELECT role.id,permission.id FROM iam.role role CROSS JOIN iam.permission permission
WHERE role.code='STOREKEEPER' AND permission.code IN (
  'CATALOG.VIEW','WAREHOUSE.VIEW',
  'INVENTORY.VIEW','INVENTORY.RESERVE','INVENTORY.POST',
  'PURCHASING.VIEW','RECEIVING.VIEW','RECEIVING.CREATE','RECEIVING.POST',
  'OUTBOUND.VIEW','OUTBOUND.CREATE','OUTBOUND.ALLOCATE','OUTBOUND.PICK','OUTBOUND.POST',
  'TRANSFER.VIEW','TRANSFER.CREATE','TRANSFER.PICK','TRANSFER.DISPATCH','TRANSFER.RECEIVE',
  'STOCKTAKE.VIEW','STOCKTAKE.CREATE','STOCKTAKE.COUNT'
) ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id,permission_id)
SELECT role.id,permission.id FROM iam.role role CROSS JOIN iam.permission permission
WHERE role.code='ACCOUNTANT' AND permission.code IN (
  'CATALOG.VIEW','WAREHOUSE.VIEW','INVENTORY.VIEW','REPORTING.VIEW','REPORTING.VIEW_COST','REPORTING.EXPORT'
) ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permission (role_id,permission_id)
SELECT role.id,permission.id FROM iam.role role CROSS JOIN iam.permission permission
WHERE role.code='SALES' AND permission.code IN ('CATALOG.VIEW','WAREHOUSE.VIEW','INVENTORY.VIEW','OUTBOUND.VIEW','OUTBOUND.CREATE')
ON CONFLICT DO NOTHING;

-- PBKDF2-SHA512 hash of demo password WmsDemo2026!.
INSERT INTO iam.app_user (username,display_name,email,role_id,auth_provider,password_hash,status) VALUES
  ('manager','Nguyễn Quản Lý (Tổng)','manager@citares.vn',(SELECT id FROM iam.role WHERE code='MANAGER'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('storekeeper_a','Thủ kho Alpha','storekeeper.a@citares.vn',(SELECT id FROM iam.role WHERE code='STOREKEEPER'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('accountant_a','Kế toán Alpha','accountant.a@citares.vn',(SELECT id FROM iam.role WHERE code='ACCOUNTANT'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('sales_a','Bán hàng Alpha','sales.a@citares.vn',(SELECT id FROM iam.role WHERE code='SALES'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('storekeeper_b','Thủ kho Beta','storekeeper.b@citares.vn',(SELECT id FROM iam.role WHERE code='STOREKEEPER'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('accountant_b','Kế toán Beta','accountant.b@citares.vn',(SELECT id FROM iam.role WHERE code='ACCOUNTANT'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('sales_b','Bán hàng Beta','sales.b@citares.vn',(SELECT id FROM iam.role WHERE code='SALES'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('storekeeper_c','Thủ kho Gamma','storekeeper.c@citares.vn',(SELECT id FROM iam.role WHERE code='STOREKEEPER'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('accountant_c','Kế toán Gamma','accountant.c@citares.vn',(SELECT id FROM iam.role WHERE code='ACCOUNTANT'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE'),
  ('sales_c','Bán hàng Gamma','sales.c@citares.vn',(SELECT id FROM iam.role WHERE code='SALES'),'LOCAL','c4d1c01fa095bddbaff62277b8a375b2:869fa89d305eb9ae3b76c91f4fbb25e319ce07fb8a94f2b9e5c01c140a7303e0ffc680f0406aaf108b6bf9d8f964f766190d79526f314f5ab479f147e81d92cf','ACTIVE')
ON CONFLICT (username) DO UPDATE SET display_name=excluded.display_name,email=excluded.email,
  role_id=excluded.role_id,password_hash=excluded.password_hash,status='ACTIVE',deactivated_at=NULL;

-- Replace scopes only for the named demo users; never touch real user scopes.
UPDATE iam.user_warehouse_scope SET revoked_at=now()
WHERE user_id IN (SELECT id FROM iam.app_user WHERE username IN (
  'manager','storekeeper_a','accountant_a','sales_a','storekeeper_b','accountant_b','sales_b',
  'storekeeper_c','accountant_c','sales_c'
)) AND revoked_at IS NULL;

INSERT INTO iam.user_warehouse_scope (user_id,warehouse_id,valid_from)
SELECT user_account.id,warehouse.id,now()
FROM iam.app_user user_account CROSS JOIN warehouse.warehouse warehouse
WHERE user_account.username='manager' AND warehouse.code IN ('KHO-A','KHO-B','KHO-C');

INSERT INTO iam.user_warehouse_scope (user_id,warehouse_id,valid_from)
SELECT user_account.id,warehouse.id,now()
FROM iam.app_user user_account JOIN warehouse.warehouse warehouse
  ON warehouse.code=CASE right(user_account.username,1) WHEN 'a' THEN 'KHO-A' WHEN 'b' THEN 'KHO-B' ELSE 'KHO-C' END
WHERE user_account.username ~ '^(storekeeper|accountant|sales)_[abc]$';
