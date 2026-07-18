CREATE TABLE catalog.brand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''), status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE catalog.category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''), status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE catalog.manufacturer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''), country_code char(2), status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE catalog.unit_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code IN ('CASE','CRATE','KEG')),
  name text NOT NULL, whole_case_only boolean NOT NULL DEFAULT true CHECK (whole_case_only)
);
CREATE TABLE catalog.product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''), category_id uuid REFERENCES catalog.category(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES catalog.brand(id) ON DELETE RESTRICT, manufacturer_id uuid REFERENCES catalog.manufacturer(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deactivated_at timestamptz
);
CREATE TABLE catalog.sku (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES catalog.product(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))), name text NOT NULL CHECK (btrim(name) <> ''),
  base_uom_id uuid NOT NULL REFERENCES catalog.unit_of_measure(id) ON DELETE RESTRICT,
  beverage_type text, volume_ml integer CHECK (volume_ml IS NULL OR volume_ml > 0), carbonated boolean,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deactivated_at timestamptz
);
CREATE INDEX ix_sku_product ON catalog.sku(product_id);
CREATE TABLE catalog.packaging_specification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  units_per_case integer NOT NULL CHECK (units_per_case > 0), unit_volume_ml integer NOT NULL CHECK (unit_volume_ml > 0),
  gross_weight_kg numeric(12,3) CHECK (gross_weight_kg IS NULL OR gross_weight_kg > 0),
  length_cm numeric(10,2), width_cm numeric(10,2), height_cm numeric(10,2),
  valid_from timestamptz NOT NULL, valid_until timestamptz, CHECK (valid_until IS NULL OR valid_until > valid_from),
  UNIQUE (sku_id, valid_from)
);
CREATE UNIQUE INDEX uq_packaging_current ON catalog.packaging_specification(sku_id) WHERE valid_until IS NULL;
CREATE TABLE catalog.barcode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  value text NOT NULL CHECK (btrim(value) <> ''), symbology text NOT NULL DEFAULT 'EAN13',
  valid_from timestamptz NOT NULL, valid_until timestamptz, CHECK (valid_until IS NULL OR valid_until > valid_from),
  UNIQUE (sku_id, value, valid_from)
);
CREATE UNIQUE INDEX uq_barcode_current ON catalog.barcode(value) WHERE valid_until IS NULL;
CREATE TABLE catalog.wholesale_quantity_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')), supplier_id uuid, sales_channel text,
  minimum_quantity bigint NOT NULL CHECK (minimum_quantity > 0), valid_from timestamptz NOT NULL, valid_until timestamptz,
  exception_mode text NOT NULL DEFAULT 'REJECT' CHECK (exception_mode IN ('REJECT','ALLOW_WITH_APPROVAL')),
  CHECK (valid_until IS NULL OR valid_until > valid_from), UNIQUE(sku_id,direction,supplier_id,sales_channel,valid_from)
);

ALTER TABLE warehouse.warehouse ADD COLUMN warehouse_type text NOT NULL DEFAULT 'PHYSICAL' CHECK (warehouse_type IN ('PHYSICAL','VIRTUAL','TRANSIT'));
CREATE TABLE warehouse.zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code = upper(btrim(code))), name text NOT NULL, zone_type text NOT NULL DEFAULT 'STORAGE'
    CHECK (zone_type IN ('RECEIVING','STORAGE','PICKING','QUARANTINE','DAMAGED','TRANSIT')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')), UNIQUE(warehouse_id,code)
);
CREATE TABLE warehouse.location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), zone_id uuid NOT NULL REFERENCES warehouse.zone(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code = upper(btrim(code))), barcode text,
  aisle text, rack text, level text, bin text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','STOCKTAKE','MAINTENANCE','INACTIVE')),
  mixing_policy text NOT NULL DEFAULT 'SINGLE_SKU' CHECK (mixing_policy IN ('SINGLE_SKU','SINGLE_BATCH','MIXED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE(zone_id,code), UNIQUE(barcode)
);
CREATE TABLE warehouse.capacity_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  max_volume_m3 numeric(14,4), max_weight_kg numeric(14,3), max_pallet_slots integer,
  violation_action text NOT NULL DEFAULT 'REJECT' CHECK (violation_action IN ('REJECT','ALLOW_WITH_APPROVAL')),
  valid_from timestamptz NOT NULL, valid_until timestamptz,
  CHECK (max_volume_m3 IS NULL OR max_volume_m3 > 0), CHECK (max_weight_kg IS NULL OR max_weight_kg > 0),
  CHECK (max_pallet_slots IS NULL OR max_pallet_slots > 0), CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (max_volume_m3 IS NOT NULL OR max_weight_kg IS NOT NULL OR max_pallet_slots IS NOT NULL)
);
CREATE UNIQUE INDEX uq_capacity_current ON warehouse.capacity_rule(location_id) WHERE valid_until IS NULL;
CREATE TABLE warehouse.location_product_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  sku_id uuid REFERENCES catalog.sku(id) ON DELETE RESTRICT, category_id uuid REFERENCES catalog.category(id) ON DELETE RESTRICT,
  allowed boolean NOT NULL, valid_from timestamptz NOT NULL, valid_until timestamptz,
  CHECK ((sku_id IS NOT NULL)::int + (category_id IS NOT NULL)::int = 1), CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE integration.master_data_import_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL, idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VALIDATING','COMPLETED','FAILED')),
  requested_by uuid NOT NULL REFERENCES iam.app_user(id), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(entity_type,idempotency_key)
);
CREATE TABLE integration.master_data_import_row (
  job_id uuid NOT NULL REFERENCES integration.master_data_import_job(id) ON DELETE RESTRICT, row_number integer NOT NULL CHECK(row_number>0),
  payload jsonb NOT NULL, status text NOT NULL CHECK(status IN ('VALID','INVALID','IMPORTED')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb, PRIMARY KEY(job_id,row_number)
);
