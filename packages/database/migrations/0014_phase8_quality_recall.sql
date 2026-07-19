CREATE SCHEMA IF NOT EXISTS quality;
CREATE SCHEMA IF NOT EXISTS recall;

INSERT INTO iam.permission (code, name, description)
VALUES
  ('QUALITY.VIEW', 'View quality cases', 'View warehouse-scoped quality cases and dispositions'),
  ('QUALITY.CREATE', 'Create quality cases', 'Report and cancel draft quality cases'),
  ('QUALITY.HOLD', 'Contain quality stock', 'Move affected whole cases into controlled stock status'),
  ('QUALITY.DISPOSITION', 'Request quality disposition', 'Submit a full-case quality disposition'),
  ('QUALITY.APPROVE', 'Approve quality disposition', 'Approve disposition requested by another actor'),
  ('QUALITY.POST', 'Post quality disposition', 'Post an approved disposition through Inventory Core'),
  ('QUALITY.EXPIRY', 'Run expiry control', 'Move expired available batches into EXPIRED stock'),
  ('RETURN.VIEW', 'View customer returns', 'View warehouse-scoped customer returns'),
  ('RETURN.CREATE', 'Create customer returns', 'Create and cancel draft whole-case returns'),
  ('RETURN.APPROVE', 'Approve customer returns', 'Approve returns created by another actor'),
  ('RETURN.POST', 'Post customer returns', 'Receive approved returns into quarantine'),
  ('RECALL.VIEW', 'View recalls', 'View recall containment and movement traceability'),
  ('RECALL.CREATE', 'Create recalls', 'Create and cancel batch recall cases'),
  ('RECALL.APPROVE', 'Approve recalls', 'Approve recalls created by another actor'),
  ('RECALL.CONTAIN', 'Contain recalled stock', 'Move all scoped batch stock into RECALLED status'),
  ('RECALL.CLOSE', 'Close recalls', 'Close a recall after all contained stock has disposition')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE quality.quality_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_code text NOT NULL UNIQUE CHECK (case_code = upper(btrim(case_code))),
  case_type text NOT NULL
    CHECK (case_type IN ('DAMAGE','EXPIRY','TEMPERATURE','PACKAGING','CUSTOMER_RETURN','RECALL','OTHER')),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','CONTAINED','PENDING_DISPOSITION','CLOSED','CANCELLED')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  origin_type text CHECK (origin_type IS NULL OR origin_type IN ('CUSTOMER_RETURN','EXPIRY_RUN','RECALL_CASE')),
  origin_id uuid,
  reported_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  contained_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  contained_at timestamptz,
  containment_idempotency_key text UNIQUE,
  containment_request_hash text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reported_by, idempotency_key),
  CHECK ((origin_type IS NULL) = (origin_id IS NULL)),
  CHECK ((contained_by IS NULL AND contained_at IS NULL) OR (contained_by IS NOT NULL AND contained_at IS NOT NULL)),
  CHECK ((containment_idempotency_key IS NULL) = (containment_request_hash IS NULL)),
  CHECK (containment_idempotency_key IS NULL OR length(containment_idempotency_key) BETWEEN 16 AND 128),
  CHECK (containment_request_hash IS NULL OR length(containment_request_hash) = 64)
);

CREATE UNIQUE INDEX uq_quality_case_origin
  ON quality.quality_case (origin_type, origin_id) WHERE origin_type IS NOT NULL;

CREATE TABLE quality.quality_case_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_case_id uuid NOT NULL REFERENCES quality.quality_case(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  balance_id uuid REFERENCES inventory.inventory_balance(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  source_location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  source_status text REFERENCES inventory.stock_status(code),
  hold_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  hold_status text NOT NULL REFERENCES inventory.stock_status(code),
  quantity bigint NOT NULL CHECK (quantity > 0),
  hold_movement_id uuid UNIQUE REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quality_case_id, line_number),
  CHECK (hold_status IN ('BLOCKED','QUARANTINED','DAMAGED','EXPIRED','RECALLED')),
  CHECK ((source_location_id IS NULL) = (source_status IS NULL))
);

CREATE TABLE quality.quality_disposition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disposition_code text NOT NULL UNIQUE CHECK (disposition_code = upper(btrim(disposition_code))),
  quality_case_id uuid NOT NULL UNIQUE REFERENCES quality.quality_case(id) ON DELETE RESTRICT,
  disposition_type text NOT NULL
    CHECK (disposition_type IN ('RELEASE','DESTROY','RETURN_TO_SUPPLIER','RECLASSIFY_DAMAGED')),
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','POSTED')),
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

CREATE TABLE quality.quality_disposition_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_disposition_id uuid NOT NULL REFERENCES quality.quality_disposition(id) ON DELETE RESTRICT,
  quality_case_line_id uuid NOT NULL UNIQUE REFERENCES quality.quality_case_line(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL CHECK (quantity > 0),
  destination_location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  destination_status text REFERENCES inventory.stock_status(code),
  movement_id uuid UNIQUE REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  UNIQUE (quality_disposition_id, quality_case_line_id),
  CHECK ((destination_location_id IS NULL) = (destination_status IS NULL)),
  CHECK (destination_status IS NULL OR destination_status IN ('AVAILABLE','DAMAGED'))
);

CREATE TABLE quality.customer_return (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_code text NOT NULL UNIQUE CHECK (return_code = upper(btrim(return_code))),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  customer_reference text NOT NULL CHECK (btrim(customer_reference) <> ''),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','POSTED','CLOSED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  posted_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  quality_case_id uuid UNIQUE REFERENCES quality.quality_case(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  post_idempotency_key text UNIQUE,
  post_request_hash text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((posted_by IS NULL AND posted_at IS NULL) OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
  CHECK ((post_idempotency_key IS NULL) = (post_request_hash IS NULL)),
  CHECK (post_idempotency_key IS NULL OR length(post_idempotency_key) BETWEEN 16 AND 128),
  CHECK (post_request_hash IS NULL OR length(post_request_hash) = 64)
);

CREATE TABLE quality.customer_return_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_return_id uuid NOT NULL REFERENCES quality.customer_return(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  quarantine_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL CHECK (quantity > 0),
  movement_id uuid UNIQUE REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  UNIQUE (customer_return_id, line_number)
);

CREATE TABLE quality.expiry_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  expired_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'POSTED' CHECK (status = 'POSTED'),
  expired_line_count integer NOT NULL DEFAULT 0 CHECK (expired_line_count >= 0),
  quality_case_id uuid UNIQUE REFERENCES quality.quality_case(id) ON DELETE RESTRICT,
  executed_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recall.recall_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_code text NOT NULL UNIQUE CHECK (recall_code = upper(btrim(recall_code))),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('CLASS_I','CLASS_II','CLASS_III')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','CONTAINED','CLOSED','CANCELLED')),
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  contained_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  contained_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  containment_idempotency_key text UNIQUE,
  containment_request_hash text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((contained_by IS NULL AND contained_at IS NULL) OR (contained_by IS NOT NULL AND contained_at IS NOT NULL)),
  CHECK ((containment_idempotency_key IS NULL) = (containment_request_hash IS NULL)),
  CHECK (containment_idempotency_key IS NULL OR length(containment_idempotency_key) BETWEEN 16 AND 128),
  CHECK (containment_request_hash IS NULL OR length(containment_request_hash) = 64)
);

CREATE UNIQUE INDEX uq_active_recall_batch
  ON recall.recall_case (batch_id) WHERE status IN ('DRAFT','APPROVED','CONTAINED');

CREATE TABLE recall.recall_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_case_id uuid NOT NULL REFERENCES recall.recall_case(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  recall_location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  UNIQUE (recall_case_id, warehouse_id),
  UNIQUE (recall_case_id, recall_location_id)
);

CREATE INDEX ix_quality_case_status ON quality.quality_case (warehouse_id, status, created_at DESC);
CREATE INDEX ix_quality_case_batch ON quality.quality_case_line (batch_id, quality_case_id);
CREATE INDEX ix_quality_return_status ON quality.customer_return (warehouse_id, status, created_at DESC);
CREATE INDEX ix_quality_expiry_date ON quality.expiry_run (warehouse_id, business_date DESC);
CREATE INDEX ix_recall_case_status ON recall.recall_case (status, created_at DESC);

CREATE OR REPLACE FUNCTION quality.validate_case_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('CONTAINED','CANCELLED')) OR
    (OLD.status = 'CONTAINED' AND NEW.status = 'PENDING_DISPOSITION') OR
    (OLD.status = 'PENDING_DISPOSITION' AND NEW.status IN ('CONTAINED','CLOSED'))
  ) THEN RAISE EXCEPTION 'QUALITY_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quality_case_state
BEFORE UPDATE OF status ON quality.quality_case
FOR EACH ROW EXECUTE FUNCTION quality.validate_case_transition();

CREATE OR REPLACE FUNCTION quality.validate_disposition_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'SUBMITTED' AND NEW.status IN ('APPROVED','REJECTED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'POSTED')
  ) THEN RAISE EXCEPTION 'QUALITY_DISPOSITION_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quality_disposition_state
BEFORE UPDATE OF status ON quality.quality_disposition
FOR EACH ROW EXECUTE FUNCTION quality.validate_disposition_transition();

CREATE OR REPLACE FUNCTION quality.validate_return_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('APPROVED','CANCELLED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'POSTED') OR
    (OLD.status = 'POSTED' AND NEW.status = 'CLOSED')
  ) THEN RAISE EXCEPTION 'RETURN_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_return_state
BEFORE UPDATE OF status ON quality.customer_return
FOR EACH ROW EXECUTE FUNCTION quality.validate_return_transition();

CREATE OR REPLACE FUNCTION recall.validate_recall_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('APPROVED','CANCELLED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'CONTAINED') OR
    (OLD.status = 'CONTAINED' AND NEW.status = 'CLOSED')
  ) THEN RAISE EXCEPTION 'RECALL_INVALID_STATE_TRANSITION:%->%', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recall_case_state
BEFORE UPDATE OF status ON recall.recall_case
FOR EACH ROW EXECUTE FUNCTION recall.validate_recall_transition();

CREATE OR REPLACE FUNCTION recall.reject_active_batch_distribution()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recall.recall_case recall_case
    WHERE recall_case.batch_id = NEW.batch_id
      AND recall_case.status IN ('APPROVED','CONTAINED')
  ) AND (
    (NEW.destination_location_id IS NOT NULL AND NEW.destination_status IS DISTINCT FROM 'RECALLED')
    OR (
      NEW.source_location_id IS NOT NULL
      AND NEW.source_status IS DISTINCT FROM 'RECALLED'
      AND NEW.destination_status IS DISTINCT FROM 'RECALLED'
    )
  ) THEN
    RAISE EXCEPTION 'RECALL_ACTIVE_BATCH_BLOCKED:%', NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_active_recall_guard
BEFORE INSERT ON inventory.inventory_movement_ledger
FOR EACH ROW EXECUTE FUNCTION recall.reject_active_batch_distribution();

COMMENT ON TABLE quality.quality_case IS 'Warehouse-scoped containment aggregate; stock changes only through Inventory Core movements.';
COMMENT ON TABLE quality.quality_disposition IS 'Full-case, full-scope disposition with requester/approver/poster separation.';
COMMENT ON TABLE quality.customer_return IS 'Customer return is received into QUARANTINED and linked to a quality case.';
COMMENT ON TABLE recall.recall_case IS 'Batch recall blocks distribution after approval and creates a RECALLED containment quality case.';
