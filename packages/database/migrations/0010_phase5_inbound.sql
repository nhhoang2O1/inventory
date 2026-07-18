CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS receiving;

-- 1. Supplier
CREATE TABLE purchasing.supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text,
  standard_lead_time_days integer NOT NULL DEFAULT 0 CHECK (standard_lead_time_days >= 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Purchase Order
CREATE TABLE purchasing.purchase_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_code text NOT NULL UNIQUE CHECK (po_code = upper(btrim(po_code))),
  supplier_id uuid NOT NULL REFERENCES purchasing.supplier(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
  order_date date NOT NULL DEFAULT current_date,
  expected_delivery_date timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Purchase Order Line
CREATE TABLE purchasing.purchase_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchasing.purchase_order(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  ordered_qty bigint NOT NULL CHECK (ordered_qty > 0),
  received_qty bigint NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  uom_id uuid NOT NULL REFERENCES catalog.unit_of_measure(id) ON DELETE RESTRICT,
  unit_price numeric(19,4) NOT NULL CHECK (unit_price >= 0),
  vat_rate numeric(5,2) NOT NULL DEFAULT 10.00 CHECK (vat_rate >= 0),
  excise_tax_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (excise_tax_rate >= 0),
  CONSTRAINT ck_received_qty_limit CHECK (received_qty <= ordered_qty * 1.10),
  UNIQUE (po_id, sku_id)
);

-- 4. Goods Receipt
CREATE TABLE receiving.goods_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_code text NOT NULL UNIQUE CHECK (gr_code = upper(btrim(gr_code))),
  po_id uuid REFERENCES purchasing.purchase_order(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECEIVING', 'POSTED', 'CANCELLED')),
  received_date timestamptz NOT NULL DEFAULT now(),
  received_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Goods Receipt Line
CREATE TABLE receiving.goods_receipt_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id uuid NOT NULL REFERENCES receiving.goods_receipt(id) ON DELETE CASCADE,
  po_line_id uuid REFERENCES purchasing.purchase_order_line(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL CHECK (quantity > 0),
  uom_id uuid NOT NULL REFERENCES catalog.unit_of_measure(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  stock_status text NOT NULL REFERENCES inventory.stock_status(code)
);
