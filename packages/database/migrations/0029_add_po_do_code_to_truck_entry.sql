-- Migration 0029: Add po_do_code column to gate.truck_entry table
ALTER TABLE gate.truck_entry ADD COLUMN IF NOT EXISTS po_do_code varchar(50);
