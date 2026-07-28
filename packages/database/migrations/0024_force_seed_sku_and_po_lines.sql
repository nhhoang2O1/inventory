-- Migration 0024: Direct Seed UOM, SKUs, and PO Lines
BEGIN;

-- 1. Ensure Products
INSERT INTO catalog.product (id, code, name, status)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'PROD-BIA-333', 'Bia 333 Lon 330ml (Khay 24 lon)', 'ACTIVE'),
  ('c2222222-2222-2222-2222-222222222222', 'PROD-SAIGON-SPEC', 'Bia Saigon Special Chai (Két 24 chai)', 'ACTIVE'),
  ('c3333333-3333-3333-3333-333333333333', 'PROD-HEINEKEN-CAN', 'Bia Heineken Lon 330ml (Khay 24 lon)', 'ACTIVE'),
  ('c4444444-4444-4444-4444-444444444444', 'PROD-TIGER-CAN', 'Bia Tiger Lon 330ml (Khay 24 lon)', 'ACTIVE'),
  ('c5555555-5555-5555-5555-555555555555', 'PROD-MIRINDA-CAN', 'Nước Ngọt Mirinda Cam (Khay 24 lon)', 'ACTIVE'),
  ('c6666666-6666-6666-6666-666666666666', 'PROD-PEPSI-CAN', 'Nước Ngọt Pepsi Cola (Khay 24 lon)', 'ACTIVE')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

-- 2. Direct Upsert SKUs using existing UOM id
INSERT INTO catalog.sku (id, product_id, code, name, base_uom_id, beverage_type, volume_ml, status)
SELECT 
  'd1111111-1111-1111-1111-111111111111', 
  'c1111111-1111-1111-1111-111111111111', 
  'SKU-BIA-333', 
  'Bia 333 Lon 330ml (Khay 24 lon)', 
  u.id, 'BEER', 330, 'ACTIVE'
FROM catalog.unit_of_measure u LIMIT 1
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO catalog.sku (id, product_id, code, name, base_uom_id, beverage_type, volume_ml, status)
SELECT 
  'd2222222-2222-2222-2222-222222222222', 
  'c2222222-2222-2222-2222-222222222222', 
  'SKU-SAIGON-SPEC', 
  'Bia Saigon Special Chai (Két 24 chai)', 
  u.id, 'BEER', 450, 'ACTIVE'
FROM catalog.unit_of_measure u LIMIT 1
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO catalog.sku (id, product_id, code, name, base_uom_id, beverage_type, volume_ml, status)
SELECT 
  'd3333333-3333-3333-3333-333333333333', 
  'c3333333-3333-3333-3333-333333333333', 
  'SKU-HEINEKEN-CAN', 
  'Bia Heineken Lon 330ml (Khay 24 lon)', 
  u.id, 'BEER', 330, 'ACTIVE'
FROM catalog.unit_of_measure u LIMIT 1
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO catalog.sku (id, product_id, code, name, base_uom_id, beverage_type, volume_ml, status)
SELECT 
  'd4444444-4444-4444-4444-444444444444', 
  'c4444444-4444-4444-4444-444444444444', 
  'SKU-TIGER-CAN', 
  'Bia Tiger Lon 330ml (Khay 24 lon)', 
  u.id, 'BEER', 330, 'ACTIVE'
FROM catalog.unit_of_measure u LIMIT 1
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO catalog.sku (id, product_id, code, name, base_uom_id, beverage_type, volume_ml, status)
SELECT 
  'd5555555-5555-5555-5555-555555555555', 
  'c5555555-5555-5555-5555-555555555555', 
  'SKU-MIRINDA-CAN', 
  'Nước Ngọt Mirinda Cam (Khay 24 lon)', 
  u.id, 'SOFT_DRINK', 330, 'ACTIVE'
FROM catalog.unit_of_measure u LIMIT 1
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO catalog.sku (id, product_id, code, name, base_uom_id, beverage_type, volume_ml, status)
SELECT 
  'd6666666-6666-6666-6666-666666666666', 
  'c6666666-6666-6666-6666-666666666666', 
  'SKU-PEPSI-CAN', 
  'Nước Ngọt Pepsi Cola (Khay 24 lon)', 
  u.id, 'SOFT_DRINK', 330, 'ACTIVE'
FROM catalog.unit_of_measure u LIMIT 1
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

-- 3. Direct Insert PO Lines
-- Clear old lines for PO-20260728-08, PO-20260728-12, PO-20260728-15
DELETE FROM purchasing.purchase_order_line
WHERE po_id IN (SELECT id FROM purchasing.purchase_order WHERE po_code IN ('PO-20260728-08', 'PO-20260728-12', 'PO-20260728-15'));

-- Insert lines for PO-20260728-08 (Sabeco)
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd1111111-1111-1111-1111-111111111111'::uuid, u.id, 500, 220000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-08' LIMIT 1;

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd2222222-2222-2222-2222-222222222222'::uuid, u.id, 300, 250000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-08' LIMIT 1;

-- Insert lines for PO-20260728-12 (Heineken)
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd3333333-3333-3333-3333-333333333333'::uuid, u.id, 400, 240000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-12' LIMIT 1;

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd4444444-4444-4444-4444-444444444444'::uuid, u.id, 200, 235000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-12' LIMIT 1;

-- Insert lines for PO-20260728-15 (PepsiCo)
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd5555555-5555-5555-5555-555555555555'::uuid, u.id, 300, 185000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-15' LIMIT 1;

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd6666666-6666-6666-6666-666666666666'::uuid, u.id, 300, 185000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-15' LIMIT 1;

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd1111111-1111-1111-1111-111111111111'::uuid, u.id, 200, 220000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-15' LIMIT 1;

COMMIT;
