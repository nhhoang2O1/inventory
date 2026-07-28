-- Migration 0026: Deactivate Test Suppliers
BEGIN;

-- Deactivate test/phase suppliers so their POs are filtered out of public PO lists
UPDATE purchasing.supplier
SET status = 'INACTIVE'
WHERE code NOT IN ('SUP-HEINEKEN', 'SUP-SABECO', 'SUP-PEPSICO') OR name LIKE 'Phase%';

COMMIT;
