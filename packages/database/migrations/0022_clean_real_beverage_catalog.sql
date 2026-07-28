-- Migration 0022: Clean Real Beverage Catalog & Clean Supplier Mappings
BEGIN;

-- 1. Deactivate test suppliers so only active real suppliers show
UPDATE purchasing.supplier 
SET status = 'INACTIVE' 
WHERE code NOT IN ('SUP-HEINEKEN', 'SUP-SABECO', 'SUP-PEPSICO');

-- 2. Deactivate test products so only active real beverage products show
UPDATE catalog.product 
SET status = 'INACTIVE' 
WHERE code NOT IN ('PROD-BIA-333', 'PROD-SAIGON-SPEC', 'PROD-HEINEKEN-CAN', 'PROD-TIGER-CAN', 'PROD-MIRINDA-CAN', 'PROD-PEPSI-CAN');

UPDATE catalog.sku 
SET status = 'INACTIVE' 
WHERE code NOT IN ('SKU-BIA-333', 'SKU-SAIGON-SPEC', 'SKU-HEINEKEN-CAN', 'SKU-TIGER-CAN', 'SKU-MIRINDA-CAN', 'SKU-PEPSI-CAN');

-- 3. Clear existing test supplier product mappings
DELETE FROM purchasing.supplier_product;

-- 4. Upsert real beverage products in catalog.product
INSERT INTO catalog.product (id, code, name, status)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'PROD-BIA-333', 'Bia 333 Lon 330ml (Khay 24 lon)', 'ACTIVE'),
  ('c2222222-2222-2222-2222-222222222222', 'PROD-SAIGON-SPEC', 'Bia Saigon Special Chai (Két 24 chai)', 'ACTIVE'),
  ('c3333333-3333-3333-3333-333333333333', 'PROD-HEINEKEN-CAN', 'Bia Heineken Lon 330ml (Khay 24 lon)', 'ACTIVE'),
  ('c4444444-4444-4444-4444-444444444444', 'PROD-TIGER-CAN', 'Bia Tiger Lon 330ml (Khay 24 lon)', 'ACTIVE'),
  ('c5555555-5555-5555-5555-555555555555', 'PROD-MIRINDA-CAN', 'Nước Ngọt Mirinda Cam (Khay 24 lon)', 'ACTIVE'),
  ('c6666666-6666-6666-6666-666666666666', 'PROD-PEPSI-CAN', 'Nước Ngọt Pepsi Cola (Khay 24 lon)', 'ACTIVE')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

-- 5. Map Supplier Products
-- Heineken supplier products
INSERT INTO purchasing.supplier_product (supplier_id, product_id, supplier_sku_code, lead_time_days, unit_price, is_preferred)
SELECT s.id, p.id, CONCAT('HEIN-', p.code), 2, 240000.00, true
FROM purchasing.supplier s, catalog.product p
WHERE s.code = 'SUP-HEINEKEN' AND p.code IN ('PROD-HEINEKEN-CAN', 'PROD-TIGER-CAN')
ON CONFLICT DO NOTHING;

-- Sabeco supplier products
INSERT INTO purchasing.supplier_product (supplier_id, product_id, supplier_sku_code, lead_time_days, unit_price, is_preferred)
SELECT s.id, p.id, CONCAT('SABECO-', p.code), 3, 220000.00, true
FROM purchasing.supplier s, catalog.product p
WHERE s.code = 'SUP-SABECO' AND p.code IN ('PROD-BIA-333', 'PROD-SAIGON-SPEC')
ON CONFLICT DO NOTHING;

-- PepsiCo supplier products
INSERT INTO purchasing.supplier_product (supplier_id, product_id, supplier_sku_code, lead_time_days, unit_price, is_preferred)
SELECT s.id, p.id, CONCAT('PEPSI-', p.code), 1, 185000.00, true
FROM purchasing.supplier s, catalog.product p
WHERE s.code = 'SUP-PEPSICO' AND p.code IN ('PROD-MIRINDA-CAN', 'PROD-PEPSI-CAN', 'PROD-BIA-333')
ON CONFLICT DO NOTHING;

COMMIT;
