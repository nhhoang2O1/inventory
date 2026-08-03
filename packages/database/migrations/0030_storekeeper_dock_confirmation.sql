-- Migration 0030: Storekeeper Dock Receipt Confirmation
ALTER TABLE gate.truck_entry
  DROP CONSTRAINT IF EXISTS truck_entry_status_check;

ALTER TABLE gate.truck_entry
  ADD CONSTRAINT truck_entry_status_check 
  CHECK (status IN ('CHECKED_IN', 'WEIGHED_IN', 'LOADING', 'DOCK_RECEIVED', 'WEIGHED_OUT', 'COMPLETED', 'REJECTED'));

ALTER TABLE gate.truck_entry
  ADD COLUMN IF NOT EXISTS storekeeper_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storekeeper_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS storekeeper_confirmed_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS storekeeper_notes text;

COMMENT ON COLUMN gate.truck_entry.storekeeper_confirmed IS 'Đánh dấu Thủ kho đã kiểm đếm và nhận đủ hàng tại Dock';
