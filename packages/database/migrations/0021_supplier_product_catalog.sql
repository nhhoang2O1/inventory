-- Migration 0021: Supplier Product Catalog N:M Mapping & Sample Purchase Orders
BEGIN;

-- 1. Create Supplier Product Mapping Table
CREATE TABLE IF NOT EXISTS purchasing.supplier_product (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES purchasing.supplier(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES catalog.product(id) ON DELETE CASCADE,
    supplier_sku_code VARCHAR(100),
    lead_time_days INTEGER NOT NULL DEFAULT 2,
    unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_preferred BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_supplier_product UNIQUE (supplier_id, product_id)
);

-- 2. Seed 3 Major Beverage Suppliers if not exists
INSERT INTO purchasing.supplier (id, code, name, phone, status, standard_lead_time_days)
VALUES 
  (
    'a1111111-1111-1111-1111-111111111111', 
    'SUP-HEINEKEN', 
    'Tập Đoàn Heineken Việt Nam', 
    '02838240200', 
    'ACTIVE', 
    2
  ),
  (
    'a2222222-2222-2222-2222-222222222222', 
    'SUP-SABECO', 
    'Tổng Công Ty Bia - Rượu - NGK Sài Gòn (Sabeco)', 
    '02838294083', 
    'ACTIVE', 
    3
  ),
  (
    'a3333333-3333-3333-3333-333333333333', 
    'SUP-PEPSICO', 
    'Công Ty Suntory PepsiCo Việt Nam', 
    '02838219437', 
    'ACTIVE', 
    1
  )
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, phone = EXCLUDED.phone, standard_lead_time_days = EXCLUDED.standard_lead_time_days;

-- 3. Map Products to Suppliers in purchasing.supplier_product
INSERT INTO purchasing.supplier_product (supplier_id, product_id, supplier_sku_code, lead_time_days, unit_price, is_preferred)
SELECT 
  s.id as supplier_id,
  p.id as product_id,
  CONCAT(s.code, '-', p.code) as supplier_sku_code,
  CASE WHEN s.code = 'SUP-PEPSICO' THEN 1 WHEN s.code = 'SUP-HEINEKEN' THEN 2 ELSE 3 END as lead_time_days,
  CASE WHEN p.code LIKE '%KEG%' THEN 450000.00 WHEN p.code LIKE '%BOTTLE%' THEN 195000.00 ELSE 240000.00 END as unit_price,
  true
FROM purchasing.supplier s
CROSS JOIN catalog.product p
WHERE s.code IN ('SUP-HEINEKEN', 'SUP-SABECO', 'SUP-PEPSICO')
ON CONFLICT (supplier_id, product_id) DO UPDATE 
SET lead_time_days = EXCLUDED.lead_time_days, unit_price = EXCLUDED.unit_price;

-- 4. Seed Sample Approved POs for Gate Weighbridge & Inbound Testing
INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, created_by, expected_delivery_date)
SELECT
  'b1111111-1111-1111-1111-111111111111',
  'PO-20260728-08',
  'a2222222-2222-2222-2222-222222222222',
  'APPROVED',
  u.id,
  now() + interval '3 days'
FROM iam.app_user u WHERE u.username = 'manager'
ON CONFLICT (po_code) DO NOTHING;

INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, created_by, expected_delivery_date)
SELECT
  'b2222222-2222-2222-2222-222222222222',
  'PO-20260728-12',
  'a1111111-1111-1111-1111-111111111111',
  'APPROVED',
  u.id,
  now() + interval '2 days'
FROM iam.app_user u WHERE u.username = 'manager'
ON CONFLICT (po_code) DO NOTHING;

INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, created_by, expected_delivery_date)
SELECT
  'b3333333-3333-3333-3333-333333333333',
  'PO-20260728-15',
  'a3333333-3333-3333-3333-333333333333',
  'PENDING_APPROVAL',
  u.id,
  now() + interval '1 day'
FROM iam.app_user u WHERE u.username = 'manager'
ON CONFLICT (po_code) DO NOTHING;

-- 5. Seed PO Lines for Multi-SKU Items
INSERT INTO purchasing.purchase_order_line (id, po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT 
  gen_random_uuid(),
  po.id,
  k.id,
  k.base_uom_id,
  CASE WHEN k.code LIKE '%333%' THEN 500 WHEN k.code LIKE '%HEIN%' THEN 300 ELSE 200 END as ordered_qty,
  240000.00
FROM purchasing.purchase_order po
CROSS JOIN catalog.sku k
WHERE po.po_code IN ('PO-20260728-08', 'PO-20260728-12', 'PO-20260728-15')
ON CONFLICT DO NOTHING;

COMMIT;
