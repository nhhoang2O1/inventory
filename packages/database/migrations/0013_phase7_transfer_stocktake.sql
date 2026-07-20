CREATE SCHEMA IF NOT EXISTS transfer;
CREATE SCHEMA IF NOT EXISTS stocktake;
CREATE SCHEMA IF NOT EXISTS adjustment;

INSERT INTO iam.permission (code, name, description)
VALUES
  ('TRANSFER.VIEW', 'View transfers', 'View location and warehouse transfers'),
  ('TRANSFER.CREATE', 'Create transfers', 'Create and cancel unposted transfers'),
  ('TRANSFER.APPROVE', 'Approve transfers', 'Approve a transfer created by another actor'),
  ('TRANSFER.PICK', 'Pick transfers', 'Confirm whole-case transfer picking'),
  ('TRANSFER.DISPATCH', 'Dispatch transfers', 'Post source to destination or IN_TRANSIT movement'),
  ('TRANSFER.RECEIVE', 'Receive transfers', 'Post partial or complete transfer receipt'),
  ('TRANSFER.CLOSE', 'Close transfers', 'Close fully received and reconciled transfers'),
  ('STOCKTAKE.VIEW', 'View stocktakes', 'View scoped stocktake sessions and results'),
  ('STOCKTAKE.CREATE', 'Create stocktakes', 'Plan, start and cancel stocktake sessions'),
  ('STOCKTAKE.COUNT', 'Count stock', 'Submit immutable blind count rounds'),
  ('STOCKTAKE.RECONCILE', 'Reconcile stocktake', 'Complete count rounds and request approval'),
  ('STOCKTAKE.APPROVE', 'Approve stocktake', 'Approve variances counted by other actors'),
  ('ADJUSTMENT.POST', 'Post adjustments', 'Post approved inventory adjustments'),
  ('ADJUSTMENT.REVERSE', 'Reverse movements', 'Approve and post append-only movement reversals')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE transfer.stock_transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_code text NOT NULL UNIQUE CHECK (transfer_code = upper(btrim(transfer_code))),
  transfer_type text NOT NULL CHECK (transfer_type IN ('LOCATION', 'WAREHOUSE')),
  source_warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  destination_warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  transit_warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  transit_location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','APPROVED','PICKING','IN_TRANSIT','PARTIALLY_RECEIVED','RECEIVED','CLOSED','CANCELLED','REVERSED')),
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  dispatch_idempotency_key text,
  dispatch_request_hash text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, idempotency_key),
  CHECK (
    (transfer_type = 'LOCATION'
      AND source_warehouse_id = destination_warehouse_id
      AND transit_warehouse_id IS NULL AND transit_location_id IS NULL)
    OR
    (transfer_type = 'WAREHOUSE'
      AND source_warehouse_id <> destination_warehouse_id
      AND transit_warehouse_id IS NOT NULL AND transit_location_id IS NOT NULL)
  ),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((dispatch_idempotency_key IS NULL) = (dispatch_request_hash IS NULL)),
  CHECK (dispatch_idempotency_key IS NULL OR length(dispatch_idempotency_key) BETWEEN 16 AND 128)
);

CREATE TABLE transfer.stock_transfer_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transfer_id uuid NOT NULL REFERENCES transfer.stock_transfer(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  source_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  destination_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  planned_quantity bigint NOT NULL CHECK (planned_quantity > 0),
  picked_quantity bigint NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  dispatched_quantity bigint NOT NULL DEFAULT 0 CHECK (dispatched_quantity >= 0),
  received_quantity bigint NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  damaged_quantity bigint NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  lost_quantity bigint NOT NULL DEFAULT 0 CHECK (lost_quantity >= 0),
  pick_idempotency_key text UNIQUE,
  pick_request_hash text,
  pick_result_version integer CHECK (pick_result_version IS NULL OR pick_result_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_transfer_id, line_number),
  CHECK (picked_quantity <= planned_quantity),
  CHECK (dispatched_quantity <= picked_quantity),
  CHECK (received_quantity + damaged_quantity + lost_quantity <= dispatched_quantity),
  CHECK ((pick_idempotency_key IS NULL) = (pick_request_hash IS NULL)),
  CHECK ((pick_idempotency_key IS NULL) = (pick_result_version IS NULL)),
  CHECK (pick_idempotency_key IS NULL OR length(pick_idempotency_key) BETWEEN 16 AND 128),
  CHECK (pick_request_hash IS NULL OR length(pick_request_hash) = 64)
);

CREATE TABLE transfer.transfer_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code text NOT NULL UNIQUE CHECK (receipt_code = upper(btrim(receipt_code))),
  stock_transfer_id uuid NOT NULL REFERENCES transfer.stock_transfer(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'POSTED' CHECK (status = 'POSTED'),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  received_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transfer.transfer_receipt_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_receipt_id uuid NOT NULL REFERENCES transfer.transfer_receipt(id) ON DELETE RESTRICT,
  stock_transfer_line_id uuid NOT NULL REFERENCES transfer.stock_transfer_line(id) ON DELETE RESTRICT,
  destination_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  damaged_location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  received_quantity bigint NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  damaged_quantity bigint NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  missing_quantity bigint NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0),
  available_movement_id uuid REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  damaged_movement_id uuid REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  CHECK (received_quantity + damaged_quantity + missing_quantity > 0),
  CHECK ((damaged_quantity = 0 AND damaged_location_id IS NULL) OR (damaged_quantity > 0 AND damaged_location_id IS NOT NULL)),
  UNIQUE (transfer_receipt_id, stock_transfer_line_id)
);

CREATE TABLE transfer.transfer_discrepancy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transfer_id uuid NOT NULL REFERENCES transfer.stock_transfer(id) ON DELETE RESTRICT,
  stock_transfer_line_id uuid NOT NULL REFERENCES transfer.stock_transfer_line(id) ON DELETE RESTRICT,
  transfer_receipt_id uuid REFERENCES transfer.transfer_receipt(id) ON DELETE RESTRICT,
  discrepancy_type text NOT NULL CHECK (discrepancy_type IN ('DAMAGED','LOSS')),
  quantity bigint NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  reported_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  resolution text,
  resolved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  resolution_idempotency_key text UNIQUE,
  resolution_request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'OPEN' AND resolution IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status = 'RESOLVED' AND btrim(resolution) <> '' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK ((resolution_idempotency_key IS NULL) = (resolution_request_hash IS NULL)),
  CHECK (resolution_idempotency_key IS NULL OR length(resolution_idempotency_key) BETWEEN 16 AND 128),
  CHECK (resolution_request_hash IS NULL OR length(resolution_request_hash) = 64)
);

CREATE TABLE stocktake.stocktake_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code text NOT NULL UNIQUE CHECK (session_code = upper(btrim(session_code))),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  zone_id uuid REFERENCES warehouse.zone(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  sku_id uuid REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  blind_count boolean NOT NULL DEFAULT true,
  recount_threshold bigint NOT NULL DEFAULT 0 CHECK (recount_threshold >= 0),
  status text NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','COUNTING','RECOUNT','RECONCILED','PENDING_APPROVAL','POSTED','CANCELLED')),
  current_round integer NOT NULL DEFAULT 0 CHECK (current_round BETWEEN 0 AND 2),
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  posted_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key),
  CHECK (location_id IS NULL OR zone_id IS NULL),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((posted_by IS NULL AND posted_at IS NULL) OR (posted_by IS NOT NULL AND posted_at IS NOT NULL))
);

CREATE TABLE stocktake.stocktake_session_location (
  stocktake_session_id uuid NOT NULL REFERENCES stocktake.stocktake_session(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  previous_status text NOT NULL CHECK (previous_status IN ('ACTIVE','LOCKED','MAINTENANCE')),
  PRIMARY KEY (stocktake_session_id, location_id)
);

CREATE TABLE stocktake.stocktake_snapshot_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_session_id uuid NOT NULL REFERENCES stocktake.stocktake_session(id) ON DELETE RESTRICT,
  balance_id uuid NOT NULL REFERENCES inventory.inventory_balance(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  stock_status text NOT NULL REFERENCES inventory.stock_status(code),
  system_quantity bigint NOT NULL CHECK (system_quantity >= 0),
  balance_version bigint NOT NULL CHECK (balance_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stocktake_session_id, balance_id)
);

CREATE TABLE stocktake.stocktake_count_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_session_id uuid NOT NULL REFERENCES stocktake.stocktake_session(id) ON DELETE RESTRICT,
  snapshot_line_id uuid NOT NULL REFERENCES stocktake.stocktake_snapshot_line(id) ON DELETE RESTRICT,
  round_number integer NOT NULL CHECK (round_number IN (1,2)),
  counted_quantity bigint NOT NULL CHECK (counted_quantity >= 0),
  counted_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  evidence_reference text,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  counted_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stocktake_session_id, snapshot_line_id, round_number),
  CHECK (evidence_reference IS NULL OR btrim(evidence_reference) <> '')
);

CREATE TABLE adjustment.inventory_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_code text NOT NULL UNIQUE CHECK (adjustment_code = upper(btrim(adjustment_code))),
  stocktake_session_id uuid UNIQUE REFERENCES stocktake.stocktake_session(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED','POSTED','REVERSED')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  approved_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  idempotency_key text UNIQUE,
  request_hash text,
  correlation_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'APPROVED' AND posted_by IS NULL AND posted_at IS NULL)
      OR (status IN ('POSTED','REVERSED') AND posted_by IS NOT NULL AND posted_at IS NOT NULL)),
  CHECK ((idempotency_key IS NULL) = (request_hash IS NULL)),
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 16 AND 128),
  CHECK (request_hash IS NULL OR length(request_hash) = 64)
);

CREATE TABLE adjustment.inventory_adjustment_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_adjustment_id uuid NOT NULL REFERENCES adjustment.inventory_adjustment(id) ON DELETE RESTRICT,
  snapshot_line_id uuid NOT NULL REFERENCES stocktake.stocktake_snapshot_line(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  stock_status text NOT NULL REFERENCES inventory.stock_status(code),
  system_quantity bigint NOT NULL CHECK (system_quantity >= 0),
  counted_quantity bigint NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity bigint NOT NULL CHECK (variance_quantity <> 0),
  movement_id uuid REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  UNIQUE (inventory_adjustment_id, snapshot_line_id),
  CHECK (variance_quantity = counted_quantity - system_quantity)
);

CREATE TABLE adjustment.reversal_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reversal_code text NOT NULL UNIQUE CHECK (reversal_code = upper(btrim(reversal_code))),
  original_document_type text NOT NULL CHECK (btrim(original_document_type) <> ''),
  original_document_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','POSTED','CANCELLED')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  posted_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  post_idempotency_key text UNIQUE,
  post_request_hash text,
  correlation_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, idempotency_key),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((posted_by IS NULL AND posted_at IS NULL) OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
  CHECK ((post_idempotency_key IS NULL) = (post_request_hash IS NULL)),
  CHECK (post_idempotency_key IS NULL OR length(post_idempotency_key) BETWEEN 16 AND 128),
  CHECK (post_request_hash IS NULL OR length(post_request_hash) = 64)
);

CREATE TABLE adjustment.reversal_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reversal_request_id uuid NOT NULL REFERENCES adjustment.reversal_request(id) ON DELETE RESTRICT,
  original_movement_id uuid NOT NULL UNIQUE REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  reversal_movement_id uuid UNIQUE REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  UNIQUE (reversal_request_id, original_movement_id)
);

CREATE INDEX ix_transfer_status ON transfer.stock_transfer (source_warehouse_id, status, created_at DESC);
CREATE INDEX ix_transfer_destination_status ON transfer.stock_transfer (destination_warehouse_id, status, created_at DESC);
CREATE INDEX ix_transfer_line_document ON transfer.stock_transfer_line (stock_transfer_id, line_number);
CREATE INDEX ix_transfer_discrepancy_open ON transfer.transfer_discrepancy (stock_transfer_id, created_at) WHERE status = 'OPEN';
CREATE INDEX ix_stocktake_status ON stocktake.stocktake_session (warehouse_id, status, created_at DESC);
CREATE INDEX ix_stocktake_snapshot_session ON stocktake.stocktake_snapshot_line (stocktake_session_id, location_id);
CREATE INDEX ix_adjustment_status ON adjustment.inventory_adjustment (warehouse_id, status, created_at DESC);
CREATE INDEX ix_reversal_status ON adjustment.reversal_request (status, created_at DESC);

CREATE OR REPLACE FUNCTION transfer.validate_transfer_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('APPROVED','CANCELLED')) OR
    (OLD.status = 'APPROVED' AND NEW.status IN ('PICKING','CANCELLED')) OR
    (OLD.status = 'PICKING' AND NEW.status IN ('IN_TRANSIT','RECEIVED','CANCELLED')) OR
    (OLD.status = 'IN_TRANSIT' AND NEW.status IN ('PARTIALLY_RECEIVED','RECEIVED')) OR
    (OLD.status = 'PARTIALLY_RECEIVED' AND NEW.status IN ('PARTIALLY_RECEIVED','RECEIVED')) OR
    (OLD.status = 'RECEIVED' AND NEW.status IN ('CLOSED','REVERSED')) OR
    (OLD.status = 'CLOSED' AND NEW.status = 'REVERSED')
  ) THEN
    RAISE EXCEPTION 'TRANSFER_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transfer_state_transition
BEFORE UPDATE OF status ON transfer.stock_transfer
FOR EACH ROW EXECUTE FUNCTION transfer.validate_transfer_transition();

CREATE OR REPLACE FUNCTION stocktake.validate_stocktake_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'PLANNED' AND NEW.status IN ('COUNTING','CANCELLED')) OR
    (OLD.status = 'COUNTING' AND NEW.status IN ('RECOUNT','RECONCILED','CANCELLED')) OR
    (OLD.status = 'RECOUNT' AND NEW.status IN ('RECONCILED','CANCELLED')) OR
    (OLD.status = 'RECONCILED' AND NEW.status IN ('PENDING_APPROVAL','CANCELLED')) OR
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('POSTED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'STOCKTAKE_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stocktake_state_transition
BEFORE UPDATE OF status ON stocktake.stocktake_session
FOR EACH ROW EXECUTE FUNCTION stocktake.validate_stocktake_transition();

CREATE OR REPLACE FUNCTION adjustment.validate_reversal_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SUBMITTED','CANCELLED')) OR
    (OLD.status = 'SUBMITTED' AND NEW.status IN ('APPROVED','CANCELLED')) OR
    (OLD.status = 'APPROVED' AND NEW.status IN ('POSTED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'REVERSAL_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reversal_state_transition
BEFORE UPDATE OF status ON adjustment.reversal_request
FOR EACH ROW EXECUTE FUNCTION adjustment.validate_reversal_transition();

CREATE OR REPLACE FUNCTION inventory.reject_stocktake_locked_location()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_source_status text; v_destination_status text;
BEGIN
  IF NEW.document_type = 'INVENTORY_ADJUSTMENT' THEN RETURN NEW; END IF;
  IF NEW.source_location_id IS NOT NULL THEN
    SELECT status INTO v_source_status FROM warehouse.location WHERE id = NEW.source_location_id FOR SHARE;
    IF v_source_status = 'STOCKTAKE' THEN RAISE EXCEPTION 'INVENTORY_LOCATION_STOCKTAKE_LOCKED:%', NEW.source_location_id; END IF;
  END IF;
  IF NEW.destination_location_id IS NOT NULL THEN
    SELECT status INTO v_destination_status FROM warehouse.location WHERE id = NEW.destination_location_id FOR SHARE;
    IF v_destination_status = 'STOCKTAKE' THEN RAISE EXCEPTION 'INVENTORY_LOCATION_STOCKTAKE_LOCKED:%', NEW.destination_location_id; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_movement_stocktake_lock
BEFORE INSERT ON inventory.inventory_movement_ledger
FOR EACH ROW EXECUTE FUNCTION inventory.reject_stocktake_locked_location();

CREATE TRIGGER trg_stocktake_count_append_only
BEFORE UPDATE OR DELETE ON stocktake.stocktake_count_entry
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TRIGGER trg_transfer_receipt_line_append_only
BEFORE UPDATE OR DELETE ON transfer.transfer_receipt_line
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

COMMENT ON TABLE transfer.stock_transfer IS 'LOCATION transfers post source to destination once; WAREHOUSE transfers post source to IN_TRANSIT then destination.';
COMMENT ON TABLE stocktake.stocktake_snapshot_line IS 'Immutable system quantity snapshot captured before blind counting begins.';
COMMENT ON TABLE adjustment.inventory_adjustment IS 'Only APPROVED and POSTED adjustment changes Inventory Core balance.';
COMMENT ON TABLE adjustment.reversal_request IS 'Append-only reversal document; original movements and documents are never edited or deleted.';
