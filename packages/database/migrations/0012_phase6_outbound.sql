CREATE SCHEMA IF NOT EXISTS outbound;

INSERT INTO iam.permission (code, name, description)
VALUES
  ('OUTBOUND.VIEW', 'View outbound', 'View issue requests, allocations, pick tasks and goods issues'),
  ('OUTBOUND.CREATE', 'Create outbound', 'Create and submit issue requests'),
  ('OUTBOUND.APPROVE', 'Approve outbound', 'Approve an issue request created by another actor'),
  ('OUTBOUND.ALLOCATE', 'Allocate outbound', 'Reserve ATP and allocate stock using FEFO'),
  ('OUTBOUND.PICK', 'Pick outbound', 'Create pick tasks and confirm barcode scans'),
  ('OUTBOUND.POST', 'Post goods issue', 'Post a goods issue through Inventory Core'),
  ('OUTBOUND.CANCEL', 'Cancel outbound', 'Cancel an unposted issue request and release reservations'),
  ('OUTBOUND.FEFO_OVERRIDE', 'Override FEFO', 'Select a non-FEFO batch with a mandatory reason')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE outbound.customer_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''),
  sales_channel text NOT NULL CHECK (sales_channel = upper(btrim(sales_channel))),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbound.issue_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_code text NOT NULL UNIQUE CHECK (issue_code = upper(btrim(issue_code))),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  customer_reference_id uuid REFERENCES outbound.customer_reference(id) ON DELETE RESTRICT,
  recipient_reference text,
  sales_channel text NOT NULL CHECK (sales_channel = upper(btrim(sales_channel))),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'ALLOCATED', 'PICKING', 'POSTED', 'CANCELLED')),
  allow_partial boolean NOT NULL DEFAULT false,
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  allocation_idempotency_key text,
  allocation_request_hash text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, idempotency_key),
  CHECK (recipient_reference IS NULL OR btrim(recipient_reference) <> ''),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (allocation_idempotency_key IS NULL OR length(allocation_idempotency_key) BETWEEN 16 AND 128),
  CHECK ((allocation_idempotency_key IS NULL) = (allocation_request_hash IS NULL))
);

CREATE TABLE outbound.issue_request_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_request_id uuid NOT NULL REFERENCES outbound.issue_request(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  requested_quantity bigint NOT NULL CHECK (requested_quantity > 0),
  allocated_quantity bigint NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
  picked_quantity bigint NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  posted_quantity bigint NOT NULL DEFAULT 0 CHECK (posted_quantity >= 0),
  backordered_quantity bigint NOT NULL DEFAULT 0 CHECK (backordered_quantity >= 0),
  free_of_charge boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_request_id, line_number),
  CHECK (allocated_quantity <= requested_quantity),
  CHECK (picked_quantity <= allocated_quantity),
  CHECK (posted_quantity <= picked_quantity),
  CHECK (posted_quantity + backordered_quantity <= requested_quantity)
);

CREATE TABLE outbound.allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_request_line_id uuid NOT NULL REFERENCES outbound.issue_request_line(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL REFERENCES inventory.inventory_reservation(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL CHECK (quantity > 0),
  picked_quantity bigint NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  fulfilled_quantity bigint NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PICKED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'RELEASED')),
  fefo_rank integer NOT NULL CHECK (fefo_rank > 0),
  override_used boolean NOT NULL DEFAULT false,
  override_reason text,
  allocated_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (picked_quantity <= quantity),
  CHECK (fulfilled_quantity <= picked_quantity),
  CHECK ((override_used AND override_reason IS NOT NULL AND btrim(override_reason) <> '') OR (NOT override_used AND override_reason IS NULL)),
  UNIQUE (issue_request_line_id, batch_id, location_id)
);

CREATE TABLE outbound.pick_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code text NOT NULL UNIQUE CHECK (task_code = upper(btrim(task_code))),
  issue_request_id uuid NOT NULL UNIQUE REFERENCES outbound.issue_request(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  assigned_to uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  started_at timestamptz,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'COMPLETED' AND completed_at IS NOT NULL) OR status <> 'COMPLETED')
);

CREATE TABLE outbound.pick_task_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_task_id uuid NOT NULL REFERENCES outbound.pick_task(id) ON DELETE RESTRICT,
  allocation_id uuid NOT NULL UNIQUE REFERENCES outbound.allocation(id) ON DELETE RESTRICT,
  expected_quantity bigint NOT NULL CHECK (expected_quantity > 0),
  picked_quantity bigint NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  last_scanned_barcode text,
  picked_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  picked_at timestamptz,
  CHECK (picked_quantity <= expected_quantity),
  CHECK ((picked_quantity = 0 AND picked_at IS NULL) OR (picked_quantity > 0 AND picked_at IS NOT NULL))
);

CREATE TABLE outbound.pick_confirmation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_task_line_id uuid NOT NULL REFERENCES outbound.pick_task_line(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  confirmed_quantity bigint NOT NULL CHECK (confirmed_quantity > 0),
  cumulative_picked_quantity bigint NOT NULL CHECK (cumulative_picked_quantity > 0),
  task_status text NOT NULL CHECK (task_status IN ('IN_PROGRESS', 'COMPLETED')),
  task_version integer NOT NULL CHECK (task_version > 0),
  confirmed_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbound.goods_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_issue_code text NOT NULL UNIQUE CHECK (goods_issue_code = upper(btrim(goods_issue_code))),
  issue_request_id uuid NOT NULL UNIQUE REFERENCES outbound.issue_request(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  posted_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  correlation_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'POSTED' AND posted_by IS NOT NULL AND posted_at IS NOT NULL) OR status <> 'POSTED')
);

CREATE TABLE outbound.goods_issue_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_issue_id uuid NOT NULL REFERENCES outbound.goods_issue(id) ON DELETE RESTRICT,
  allocation_id uuid NOT NULL UNIQUE REFERENCES outbound.allocation(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL REFERENCES inventory.inventory_reservation(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL CHECK (quantity > 0),
  UNIQUE (goods_issue_id, allocation_id)
);

CREATE TABLE outbound.mrsl_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  customer_reference_id uuid REFERENCES outbound.customer_reference(id) ON DELETE RESTRICT,
  sales_channel text,
  warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  minimum_remaining_days integer NOT NULL CHECK (minimum_remaining_days >= 0),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sales_channel IS NULL OR sales_channel = upper(btrim(sales_channel))),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  UNIQUE NULLS NOT DISTINCT (sku_id, customer_reference_id, sales_channel, warehouse_id, valid_from)
);

CREATE INDEX ix_issue_request_warehouse_status
  ON outbound.issue_request (warehouse_id, status, created_at DESC);
CREATE INDEX ix_issue_request_line_sku
  ON outbound.issue_request_line (sku_id, issue_request_id);
CREATE INDEX ix_allocation_active_source
  ON outbound.allocation (batch_id, location_id, status)
  WHERE status IN ('ACTIVE', 'PICKED');
CREATE INDEX ix_pick_task_status
  ON outbound.pick_task (status, created_at);
CREATE INDEX ix_pick_confirmation_line
  ON outbound.pick_confirmation (pick_task_line_id, confirmed_at);
CREATE INDEX ix_goods_issue_posted
  ON outbound.goods_issue (posted_at DESC) WHERE status = 'POSTED';
CREATE INDEX ix_outbound_mrsl_lookup
  ON outbound.mrsl_policy (sku_id, valid_from, valid_until);

CREATE VIEW outbound.fefo_available_inventory AS
SELECT
  b.id AS balance_id,
  b.sku_id,
  b.batch_id,
  b.warehouse_id,
  b.location_id,
  bt.batch_code,
  bt.expiration_date,
  bt.first_received_date,
  b.quantity_on_hand,
  greatest(
    b.quantity_on_hand - coalesce((
      SELECT sum(a.quantity - a.fulfilled_quantity)
      FROM outbound.allocation a
      JOIN outbound.issue_request_line irl ON irl.id = a.issue_request_line_id
      JOIN outbound.issue_request ir ON ir.id = irl.issue_request_id
      WHERE a.batch_id = b.batch_id
        AND a.location_id = b.location_id
        AND ir.warehouse_id = b.warehouse_id
        AND a.status IN ('ACTIVE', 'PICKED')
    ), 0),
    0
  )::bigint AS allocatable_quantity
FROM inventory.inventory_balance b
JOIN inventory.batch bt ON bt.id = b.batch_id
JOIN warehouse.location l ON l.id = b.location_id AND l.status = 'ACTIVE'
WHERE b.stock_status = 'AVAILABLE' AND b.quantity_on_hand > 0;

UPDATE inventory.batch batch
SET first_received_date = receipt.first_received_date
FROM (
  SELECT batch_id, min(occurred_at)::date AS first_received_date
  FROM inventory.inventory_movement_ledger
  WHERE movement_type = 'RECEIPT'
  GROUP BY batch_id
) receipt
WHERE batch.id = receipt.batch_id AND batch.first_received_date IS NULL;

CREATE OR REPLACE FUNCTION outbound.validate_issue_request_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SUBMITTED', 'CANCELLED')) OR
    (OLD.status = 'SUBMITTED' AND NEW.status IN ('APPROVED', 'CANCELLED')) OR
    (OLD.status = 'APPROVED' AND NEW.status IN ('ALLOCATED', 'CANCELLED')) OR
    (OLD.status = 'ALLOCATED' AND NEW.status IN ('PICKING', 'CANCELLED')) OR
    (OLD.status = 'PICKING' AND NEW.status IN ('POSTED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'OUTBOUND_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_issue_request_state_transition
BEFORE UPDATE OF status ON outbound.issue_request
FOR EACH ROW EXECUTE FUNCTION outbound.validate_issue_request_transition();

CREATE TRIGGER trg_goods_issue_line_append_only
BEFORE UPDATE OR DELETE ON outbound.goods_issue_line
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

COMMENT ON VIEW outbound.fefo_available_inventory IS 'Outbound read contract ordered by the consumer using expiration, first receipt, batch and location; ATP remains owned by Inventory Core.';
COMMENT ON TABLE outbound.allocation IS 'Reservation-backed batch/location selection. RESERVED is never represented as StockStatus.';
COMMENT ON TABLE outbound.goods_issue IS 'Only POSTED Goods Issue may call Inventory Core and decrease on-hand.';
