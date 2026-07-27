-- Migration 0019: Gate & Weighbridge Management System
CREATE SCHEMA IF NOT EXISTS gate;

-- 1. Truck Entry / Gate Check-in Record
CREATE TABLE IF NOT EXISTS gate.truck_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_code text NOT NULL UNIQUE CHECK (entry_code = upper(btrim(entry_code))),
  license_plate text NOT NULL CHECK (btrim(license_plate) <> ''),
  driver_name text NOT NULL CHECK (btrim(driver_name) <> ''),
  driver_id_card text,
  carrier_name text,
  entry_type text NOT NULL DEFAULT 'MANUAL' CHECK (entry_type IN ('QR_SCAN', 'MANUAL')),
  purpose text NOT NULL DEFAULT 'INBOUND' CHECK (purpose IN ('INBOUND', 'OUTBOUND', 'INTERNAL_TRANSFER')),
  po_id uuid REFERENCES purchasing.purchase_order(id) ON DELETE RESTRICT,
  so_id uuid,
  dock_location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'CHECKED_IN' CHECK (status IN ('CHECKED_IN', 'WEIGHED_IN', 'LOADING', 'WEIGHED_OUT', 'COMPLETED', 'REJECTED')),
  created_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_truck_entry_status ON gate.truck_entry(status);
CREATE INDEX IF NOT EXISTS idx_truck_entry_created ON gate.truck_entry(created_at DESC);

-- 2. Weighbridge Ticket / Scale History
CREATE TABLE IF NOT EXISTS gate.weighbridge_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_entry_id uuid NOT NULL REFERENCES gate.truck_entry(id) ON DELETE CASCADE,
  weight_in numeric(12,2) NOT NULL CHECK (weight_in >= 0),
  weighed_in_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  weighed_in_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  weight_out numeric(12,2) CHECK (weight_out >= 0),
  weighed_out_at timestamptz,
  weighed_out_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  net_weight numeric(12,2) CHECK (net_weight >= 0),
  expected_weight numeric(12,2) CHECK (expected_weight >= 0),
  weight_diff numeric(12,2),
  diff_percentage numeric(5,2),
  verification_status text DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VALID', 'EXCEEDED_TOLERANCE', 'OVERRIDDEN')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_weighbridge_ticket_entry ON gate.weighbridge_ticket(truck_entry_id);

COMMENT ON TABLE gate.truck_entry IS 'Quản lý lịch sử xe ra vào cổng kho và phân luồng Dock bốc hạ hàng.';
COMMENT ON TABLE gate.weighbridge_ticket IS 'Lưu vết lịch sử cân W1, W2 và kết quả tự động đối soát khối lượng thực tế vs lý thuyết.';
