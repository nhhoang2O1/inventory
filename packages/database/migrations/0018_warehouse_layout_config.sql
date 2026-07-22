-- Migration 0018: Warehouse 2D Layout Config
CREATE TABLE IF NOT EXISTS warehouse.layout_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  name text NOT NULL DEFAULT 'Sơ đồ mặt bằng kho',
  grid_width integer NOT NULL DEFAULT 2000 CHECK (grid_width > 0),
  grid_height integer NOT NULL DEFAULT 1200 CHECK (grid_height > 0),
  layout_data jsonb NOT NULL DEFAULT '{"nodes":[],"gridSize":20}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correlation_id text
);

CREATE INDEX IF NOT EXISTS idx_layout_config_wh_status ON warehouse.layout_config(warehouse_id, status);
