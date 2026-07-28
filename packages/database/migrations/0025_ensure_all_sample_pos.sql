-- Migration 0025: Ensure All Sample POs and Lines
BEGIN;

-- 1. Ensure Suppliers exist and are ACTIVE
INSERT INTO purchasing.supplier (id, code, name, phone, standard_lead_time_days, status)
VALUES
  ('b1111111-1111-1111-1111-111111111111', 'SUP-HEINEKEN', 'Tập Đoàn Heineken Việt Nam', '02838240200', 2, 'ACTIVE'),
  ('b2222222-2222-2222-2222-222222222222', 'SUP-SABECO', 'Tổng Công Ty Bia - Rượu - NGK Sài Gòn (Sabeco)', '02838294083', 3, 'ACTIVE'),
  ('b3333333-3333-3333-3333-333333333333', 'SUP-PEPSICO', 'Công Ty Suntory PepsiCo Việt Nam', '02838219437', 1, 'ACTIVE')
ON CONFLICT (code) DO UPDATE SET status = 'ACTIVE';

-- 2. Ensure POs exist
INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, order_date, expected_delivery_date, created_by)
SELECT 
  'c0000008-0000-0000-0000-000000000008'::uuid, 'PO-20260728-08', s.id, 'APPROVED', CURRENT_DATE, CURRENT_DATE + INTERVAL '3 days', u.id
FROM purchasing.supplier s, iam.app_user u
WHERE s.code = 'SUP-SABECO' AND u.username = 'manager'
ON CONFLICT (po_code) DO UPDATE SET status = 'APPROVED';

INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, order_date, expected_delivery_date, created_by)
SELECT 
  'c0000012-0000-0000-0000-000000000012'::uuid, 'PO-20260728-12', s.id, 'APPROVED', CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', u.id
FROM purchasing.supplier s, iam.app_user u
WHERE s.code = 'SUP-HEINEKEN' AND u.username = 'manager'
ON CONFLICT (po_code) DO UPDATE SET status = 'APPROVED';

INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, order_date, expected_delivery_date, created_by)
SELECT 
  'c0000015-0000-0000-0000-000000000015'::uuid, 'PO-20260728-15', s.id, 'APPROVED', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', u.id
FROM purchasing.supplier s, iam.app_user u
WHERE s.code = 'SUP-PEPSICO' AND u.username = 'manager'
ON CONFLICT (po_code) DO UPDATE SET status = 'APPROVED';

-- 3. Ensure PO Lines
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
