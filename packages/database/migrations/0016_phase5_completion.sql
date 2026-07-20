INSERT INTO iam.permission (code, name, description)
VALUES
  ('SUPPLIER.VIEW', 'View suppliers', 'View supplier master data'),
  ('SUPPLIER.MANAGE', 'Manage suppliers', 'Create and update audited supplier master data'),
  ('PURCHASING.VIEW', 'View purchasing', 'View warehouse-scoped purchase requests and purchase orders'),
  ('PURCHASING.PR_CREATE', 'Create purchase requests', 'Create, submit and cancel warehouse purchase requests'),
  ('PURCHASING.PR_APPROVE', 'Approve purchase requests', 'Approve or reject another actor purchase request'),
  ('PURCHASING.PO_CREATE', 'Create purchase orders', 'Create purchase orders or convert approved purchase requests'),
  ('PURCHASING.PO_APPROVE', 'Approve purchase orders', 'Approve another actor purchase order'),
  ('PURCHASING.PO_SEND', 'Send purchase orders', 'Send an approved purchase order and establish delivery schedules'),
  ('PURCHASING.PO_CLOSE', 'Close purchase orders', 'Close received or approved remaining purchase quantities'),
  ('PURCHASING.CALENDAR_MANAGE', 'Manage business calendars', 'Configure audited working and non-working dates'),
  ('RECEIVING.VIEW', 'View goods receipts', 'View warehouse-scoped goods receipts and exceptions'),
  ('RECEIVING.CREATE', 'Create goods receipts', 'Create and confirm warehouse goods receipts'),
  ('RECEIVING.POST', 'Post goods receipts', 'Post confirmed receipts through Inventory Core'),
  ('RECEIVING.EXCEPTION_REQUEST', 'Request receipt exceptions', 'Request MRSL, over-receipt or minimum-quantity exceptions'),
  ('RECEIVING.EXCEPTION_APPROVE', 'Approve receipt exceptions', 'Approve a receipt exception requested by another actor')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE purchasing.business_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  weekend_days integer[] NOT NULL DEFAULT ARRAY[0,6]::integer[],
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (weekend_days <@ ARRAY[0,1,2,3,4,5,6]::integer[])
);

CREATE TABLE purchasing.business_calendar_day (
  business_calendar_id uuid NOT NULL REFERENCES purchasing.business_calendar(id) ON DELETE RESTRICT,
  calendar_date date NOT NULL,
  is_working_day boolean NOT NULL,
  description text,
  configured_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  configured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_calendar_id, calendar_date),
  CHECK (description IS NULL OR btrim(description) <> '')
);

ALTER TABLE purchasing.supplier
  ADD COLUMN business_calendar_id uuid REFERENCES purchasing.business_calendar(id) ON DELETE RESTRICT,
  ADD COLUMN contact_email text,
  ADD COLUMN payment_terms text,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE purchasing.purchase_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_code text NOT NULL UNIQUE CHECK (pr_code = upper(btrim(pr_code))),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES purchasing.supplier(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED','CANCELLED')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  required_by_date date,
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason text,
  converted_po_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  correlation_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by,idempotency_key),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status NOT IN ('REJECTED') OR btrim(decision_reason) <> '')
);

CREATE TABLE purchasing.purchase_request_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES purchasing.purchase_request(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  requested_quantity bigint NOT NULL CHECK (requested_quantity > 0),
  uom_id uuid NOT NULL REFERENCES catalog.unit_of_measure(id) ON DELETE RESTRICT,
  suggested_supplier_id uuid REFERENCES purchasing.supplier(id) ON DELETE RESTRICT,
  estimated_delivery_date date,
  note text,
  UNIQUE (purchase_request_id,line_number),
  UNIQUE (purchase_request_id,sku_id)
);

ALTER TABLE purchasing.purchase_order
  ADD COLUMN warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  ADD COLUMN source_pr_id uuid UNIQUE REFERENCES purchasing.purchase_request(id) ON DELETE RESTRICT,
  ADD COLUMN business_calendar_id uuid REFERENCES purchasing.business_calendar(id) ON DELETE RESTRICT,
  ADD COLUMN receiving_tolerance_percent numeric(5,2) NOT NULL DEFAULT 2.00
    CHECK (receiving_tolerance_percent >= 0 AND receiving_tolerance_percent <= 10),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN sent_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN decision_reason text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN request_hash text,
  ADD COLUMN correlation_id uuid,
  ADD COLUMN closed_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN close_reason text,
  ADD CONSTRAINT ck_po_idempotency_fields CHECK ((idempotency_key IS NULL) = (request_hash IS NULL)),
  ADD CONSTRAINT ck_po_idempotency_key CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 16 AND 128),
  ADD CONSTRAINT ck_po_request_hash CHECK (request_hash IS NULL OR length(request_hash) = 64),
  ADD CONSTRAINT ck_po_approval_fields CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  ADD CONSTRAINT ck_po_sent_fields CHECK ((sent_by IS NULL AND sent_at IS NULL) OR (sent_by IS NOT NULL AND sent_at IS NOT NULL)),
  ADD CONSTRAINT ck_po_closed_fields CHECK ((closed_by IS NULL AND closed_at IS NULL) OR (closed_by IS NOT NULL AND closed_at IS NOT NULL));

CREATE UNIQUE INDEX uq_po_actor_idempotency
  ON purchasing.purchase_order (created_by,idempotency_key) WHERE idempotency_key IS NOT NULL;

UPDATE purchasing.purchase_order po
SET warehouse_id = source.warehouse_id
FROM (
  SELECT receipt.po_id,min(zone.warehouse_id::text)::uuid AS warehouse_id
  FROM receiving.goods_receipt receipt
  JOIN receiving.goods_receipt_line line ON line.gr_id=receipt.id
  JOIN warehouse.location location ON location.id=line.location_id
  JOIN warehouse.zone zone ON zone.id=location.zone_id
  GROUP BY receipt.po_id
) source
WHERE po.id=source.po_id AND po.warehouse_id IS NULL;

CREATE TABLE purchasing.purchase_order_delivery_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_line_id uuid NOT NULL REFERENCES purchasing.purchase_order_line(id) ON DELETE RESTRICT,
  schedule_number integer NOT NULL CHECK (schedule_number > 0),
  promised_date date NOT NULL,
  promised_quantity bigint NOT NULL CHECK (promised_quantity > 0),
  accepted_quantity bigint NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_line_id,schedule_number),
  CHECK (accepted_quantity <= promised_quantity * 2)
);

ALTER TABLE purchasing.purchase_request
  ADD CONSTRAINT fk_pr_converted_po FOREIGN KEY (converted_po_id)
  REFERENCES purchasing.purchase_order(id) ON DELETE RESTRICT;

ALTER TABLE receiving.goods_receipt
  ADD COLUMN warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  ADD COLUMN request_hash text,
  ADD COLUMN external_reference text,
  ADD COLUMN confirmed_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN post_idempotency_key text,
  ADD COLUMN post_request_hash text,
  ADD COLUMN posted_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  ADD COLUMN posted_at timestamptz,
  ADD COLUMN correlation_id uuid,
  ADD CONSTRAINT ck_gr_create_hash CHECK (request_hash IS NULL OR length(request_hash)=64),
  ADD CONSTRAINT ck_gr_confirm_fields CHECK ((confirmed_by IS NULL AND confirmed_at IS NULL) OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  ADD CONSTRAINT ck_gr_post_key_fields CHECK ((post_idempotency_key IS NULL) = (post_request_hash IS NULL)),
  ADD CONSTRAINT ck_gr_post_key CHECK (post_idempotency_key IS NULL OR length(post_idempotency_key) BETWEEN 16 AND 128),
  ADD CONSTRAINT ck_gr_post_hash CHECK (post_request_hash IS NULL OR length(post_request_hash)=64),
  ADD CONSTRAINT ck_gr_posted_fields CHECK ((posted_by IS NULL AND posted_at IS NULL) OR (posted_by IS NOT NULL AND posted_at IS NOT NULL));

ALTER TABLE receiving.goods_receipt DROP CONSTRAINT goods_receipt_idempotency_key_key;

CREATE UNIQUE INDEX uq_gr_actor_idempotency ON receiving.goods_receipt (received_by,idempotency_key);
CREATE UNIQUE INDEX uq_gr_external_reference ON receiving.goods_receipt (external_reference) WHERE external_reference IS NOT NULL;
CREATE UNIQUE INDEX uq_gr_post_idempotency ON receiving.goods_receipt (post_idempotency_key) WHERE post_idempotency_key IS NOT NULL;

UPDATE receiving.goods_receipt receipt
SET warehouse_id=source.warehouse_id
FROM (
  SELECT line.gr_id,min(zone.warehouse_id::text)::uuid AS warehouse_id
  FROM receiving.goods_receipt_line line
  JOIN warehouse.location location ON location.id=line.location_id
  JOIN warehouse.zone zone ON zone.id=location.zone_id
  GROUP BY line.gr_id
) source
WHERE receipt.id=source.gr_id AND receipt.warehouse_id IS NULL;

CREATE TABLE receiving.receipt_exception_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_code text NOT NULL UNIQUE CHECK (exception_code = upper(btrim(exception_code))),
  goods_receipt_id uuid NOT NULL REFERENCES receiving.goods_receipt(id) ON DELETE RESTRICT,
  goods_receipt_line_id uuid REFERENCES receiving.goods_receipt_line(id) ON DELETE RESTRICT,
  exception_type text NOT NULL CHECK (exception_type IN ('MRSL','OVER_RECEIPT','MINIMUM_QUANTITY','UNPLANNED_RECEIPT')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CONSUMED')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason text,
  consumed_by uuid REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  consumed_at timestamptz,
  correlation_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash)=64),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by,idempotency_key),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((consumed_by IS NULL AND consumed_at IS NULL) OR (consumed_by IS NOT NULL AND consumed_at IS NOT NULL)),
  CHECK (status <> 'REJECTED' OR btrim(decision_reason) <> '')
);

CREATE UNIQUE INDEX uq_active_receipt_exception
  ON receiving.receipt_exception_request (goods_receipt_id,goods_receipt_line_id,exception_type)
  WHERE status IN ('PENDING','APPROVED');

CREATE INDEX ix_pr_warehouse_status ON purchasing.purchase_request (warehouse_id,status,created_at DESC);
CREATE INDEX ix_po_warehouse_status ON purchasing.purchase_order (warehouse_id,status,created_at DESC);
CREATE INDEX ix_po_schedule_due ON purchasing.purchase_order_delivery_schedule (promised_date,status);
CREATE INDEX ix_gr_warehouse_status ON receiving.goods_receipt (warehouse_id,status,created_at DESC);
CREATE INDEX ix_receipt_exception_status ON receiving.receipt_exception_request (goods_receipt_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION purchasing.add_working_days(p_calendar_id uuid,p_start_date date,p_days integer)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_date date := p_start_date;
  v_added integer := 0;
  v_weekend integer[];
  v_override boolean;
BEGIN
  IF p_days < 0 THEN RAISE EXCEPTION 'lead time days cannot be negative'; END IF;
  IF p_calendar_id IS NULL THEN RETURN p_start_date + p_days; END IF;
  SELECT weekend_days INTO v_weekend FROM purchasing.business_calendar
  WHERE id=p_calendar_id AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASING_CALENDAR_NOT_ACTIVE'; END IF;
  WHILE v_added < p_days LOOP
    v_date := v_date + 1;
    SELECT is_working_day INTO v_override
    FROM purchasing.business_calendar_day
    WHERE business_calendar_id=p_calendar_id AND calendar_date=v_date;
    IF FOUND THEN
      IF v_override THEN v_added := v_added + 1; END IF;
    ELSIF NOT (extract(dow FROM v_date)::integer = ANY(v_weekend)) THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;
  RETURN v_date;
END;
$$;

CREATE OR REPLACE FUNCTION purchasing.validate_purchase_request_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('SUBMITTED','CANCELLED')) OR
    (OLD.status='SUBMITTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR
    (OLD.status='APPROVED' AND NEW.status='CONVERTED')
  ) THEN RAISE EXCEPTION 'PURCHASE_REQUEST_INVALID_STATE_TRANSITION:%->%',OLD.status,NEW.status; END IF;
  IF NEW.status IN ('APPROVED','REJECTED') AND NEW.approved_by=NEW.requested_by THEN
    RAISE EXCEPTION 'PURCHASE_REQUEST_FOUR_EYES_VIOLATION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_request_state
BEFORE UPDATE OF status ON purchasing.purchase_request
FOR EACH ROW EXECUTE FUNCTION purchasing.validate_purchase_request_transition();

CREATE OR REPLACE FUNCTION purchasing.validate_purchase_order_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('PENDING_APPROVAL','CANCELLED')) OR
    (OLD.status='PENDING_APPROVAL' AND NEW.status IN ('APPROVED','CANCELLED')) OR
    (OLD.status='APPROVED' AND NEW.status IN ('SENT','CANCELLED','CLOSED')) OR
    (OLD.status='SENT' AND NEW.status IN ('PARTIALLY_RECEIVED','RECEIVED','CANCELLED','CLOSED')) OR
    (OLD.status='PARTIALLY_RECEIVED' AND NEW.status IN ('RECEIVED','CLOSED')) OR
    (OLD.status='RECEIVED' AND NEW.status='CLOSED')
  ) THEN RAISE EXCEPTION 'PURCHASE_ORDER_INVALID_STATE_TRANSITION:%->%',OLD.status,NEW.status; END IF;
  IF NEW.status='APPROVED' AND NEW.approved_by=NEW.created_by THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_FOUR_EYES_VIOLATION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_order_state
BEFORE UPDATE OF status ON purchasing.purchase_order
FOR EACH ROW EXECUTE FUNCTION purchasing.validate_purchase_order_transition();

CREATE OR REPLACE FUNCTION receiving.validate_goods_receipt_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('RECEIVING','CANCELLED')) OR
    (OLD.status='RECEIVING' AND NEW.status IN ('POSTED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'GOODS_RECEIPT_INVALID_STATE_TRANSITION:%->%',OLD.status,NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_goods_receipt_state
BEFORE UPDATE OF status ON receiving.goods_receipt
FOR EACH ROW EXECUTE FUNCTION receiving.validate_goods_receipt_transition();

CREATE OR REPLACE FUNCTION receiving.validate_exception_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED')) OR
    (OLD.status='APPROVED' AND NEW.status='CONSUMED')
  ) THEN RAISE EXCEPTION 'RECEIPT_EXCEPTION_INVALID_STATE_TRANSITION:%->%',OLD.status,NEW.status; END IF;
  IF NEW.status IN ('APPROVED','REJECTED') AND NEW.approved_by=NEW.requested_by THEN
    RAISE EXCEPTION 'RECEIPT_EXCEPTION_FOUR_EYES_VIOLATION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_receipt_exception_state
BEFORE UPDATE OF status ON receiving.receipt_exception_request
FOR EACH ROW EXECUTE FUNCTION receiving.validate_exception_transition();

COMMENT ON TABLE purchasing.purchase_request IS 'Warehouse-scoped multi-line PR with four-eyes approval and explicit PO conversion.';
COMMENT ON TABLE purchasing.purchase_order_delivery_schedule IS 'Supplier KPI source schedule; accepted quantity is updated by POSTED receipts.';
COMMENT ON TABLE receiving.receipt_exception_request IS 'Four-eyes exception consumed exactly once during Goods Receipt posting.';
