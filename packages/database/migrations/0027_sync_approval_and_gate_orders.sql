-- Migration 0027: Insert DRAFT PO for Approval Center test
BEGIN;

-- Insert a new pending PO with status DRAFT for Approval Center (CHỜ DUYỆT)
INSERT INTO purchasing.purchase_order (id, po_code, supplier_id, status, order_date, expected_delivery_date, created_by)
SELECT 
  'c0000099-0000-0000-0000-000000000099'::uuid, 'PO-20260728-99', s.id, 'DRAFT', CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', u.id
FROM purchasing.supplier s, iam.app_user u
WHERE s.code = 'SUP-PEPSICO' AND u.username = 'manager'
ON CONFLICT (po_code) DO NOTHING;

-- Insert PO line for PO-20260728-99
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, 'd5555555-5555-5555-5555-555555555555'::uuid, u.id, 400, 185000.00
FROM purchasing.purchase_order po, catalog.unit_of_measure u WHERE po.po_code = 'PO-20260728-99' LIMIT 1
ON CONFLICT DO NOTHING;

COMMIT;
