-- Migration 0023: Seed Sample Multi-SKU PO Lines
BEGIN;

-- 1. Ensure UOM exists
INSERT INTO catalog.unit_of_measure (id, code, name, whole_case_only)
VALUES 
  ('e1111111-1111-1111-1111-111111111111', 'CASE', 'Khay/Thùng', true),
  ('e2222222-2222-2222-2222-222222222222', 'CRATE', 'Két 24 chai', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Clear old lines for sample POs if any
DELETE FROM purchasing.purchase_order_line
WHERE po_id IN (
  SELECT id FROM purchasing.purchase_order WHERE po_code IN ('PO-20260728-08', 'PO-20260728-12', 'PO-20260728-15')
);

-- 3. Seed PO Lines for PO-20260728-08 (Sabeco)
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e1111111-1111-1111-1111-111111111111'::uuid), 500, 220000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-08' AND k.code = 'SKU-BIA-333';

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e2222222-2222-2222-2222-222222222222'::uuid), 300, 250000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-08' AND k.code = 'SKU-SAIGON-SPEC';

-- 4. Seed PO Lines for PO-20260728-12 (Heineken)
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e1111111-1111-1111-1111-111111111111'::uuid), 400, 240000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-12' AND k.code = 'SKU-HEINEKEN-CAN';

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e1111111-1111-1111-1111-111111111111'::uuid), 200, 235000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-12' AND k.code = 'SKU-TIGER-CAN';

-- 5. Seed PO Lines for PO-20260728-15 (PepsiCo)
INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e1111111-1111-1111-1111-111111111111'::uuid), 300, 185000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-15' AND k.code = 'SKU-MIRINDA-CAN';

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e1111111-1111-1111-1111-111111111111'::uuid), 300, 185000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-15' AND k.code = 'SKU-PEPSI-CAN';

INSERT INTO purchasing.purchase_order_line (po_id, sku_id, uom_id, ordered_qty, unit_price)
SELECT po.id, k.id, COALESCE(k.base_uom_id, 'e1111111-1111-1111-1111-111111111111'::uuid), 200, 220000.00
FROM purchasing.purchase_order po, catalog.sku k
WHERE po.po_code = 'PO-20260728-15' AND k.code = 'SKU-BIA-333';

COMMIT;
