CREATE SCHEMA IF NOT EXISTS planning;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS integration;

INSERT INTO iam.permission (code, name, description)
VALUES
  ('PLANNING.VIEW', 'View replenishment planning', 'View warehouse-scoped ROP policies, runs and draft purchase requests'),
  ('PLANNING.CONFIGURE', 'Configure replenishment planning', 'Create effective-dated ROP and safety-stock policies'),
  ('PLANNING.RUN', 'Run replenishment planning', 'Run deterministic replenishment and create draft purchase requests'),
  ('REPORTING.VIEW', 'View operational reports', 'View warehouse-scoped dashboards and operational reports'),
  ('REPORTING.VIEW_COST', 'View inventory cost', 'View cost ledger and inventory valuation'),
  ('REPORTING.EXPORT', 'Export reports', 'Export an immutable report snapshot'),
  ('INTEGRATION.VIEW', 'View integration reconciliation', 'View outbox delivery, retry and dead-letter state'),
  ('INTEGRATION.CONFIGURE', 'Configure integration endpoints', 'Configure POS, ERP, accounting and notification subscriptions'),
  ('INTEGRATION.REPLAY', 'Replay dead-letter events', 'Replay a dead-letter delivery with a mandatory reason')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE planning.reorder_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES purchasing.supplier(id) ON DELETE RESTRICT,
  lead_time_days integer NOT NULL CHECK (lead_time_days >= 0),
  safety_stock_quantity bigint NOT NULL CHECK (safety_stock_quantity >= 0),
  coverage_days integer NOT NULL CHECK (coverage_days > 0),
  sales_window_days integer NOT NULL DEFAULT 30 CHECK (sales_window_days > 0),
  order_multiple bigint NOT NULL DEFAULT 1 CHECK (order_multiple > 0),
  minimum_stock_quantity bigint CHECK (minimum_stock_quantity IS NULL OR minimum_stock_quantity >= 0),
  maximum_stock_quantity bigint CHECK (maximum_stock_quantity IS NULL OR maximum_stock_quantity > 0),
  valid_from date NOT NULL,
  valid_until date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key),
  UNIQUE (warehouse_id, sku_id, valid_from),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (maximum_stock_quantity IS NULL OR minimum_stock_quantity IS NULL OR maximum_stock_quantity >= minimum_stock_quantity)
);

CREATE UNIQUE INDEX uq_reorder_policy_current
  ON planning.reorder_policy (warehouse_id, sku_id) WHERE status = 'ACTIVE' AND valid_until IS NULL;

CREATE TABLE planning.replenishment_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status = 'COMPLETED'),
  policy_count integer NOT NULL DEFAULT 0 CHECK (policy_count >= 0),
  suggestion_count integer NOT NULL DEFAULT 0 CHECK (suggestion_count >= 0),
  executed_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, business_date),
  UNIQUE (executed_by, idempotency_key)
);

CREATE TABLE planning.replenishment_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replenishment_run_id uuid NOT NULL REFERENCES planning.replenishment_run(id) ON DELETE RESTRICT,
  reorder_policy_id uuid NOT NULL REFERENCES planning.reorder_policy(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES purchasing.supplier(id) ON DELETE RESTRICT,
  sellable_on_hand bigint NOT NULL CHECK (sellable_on_hand >= 0),
  active_reservation bigint NOT NULL CHECK (active_reservation >= 0),
  atp bigint NOT NULL,
  reliable_inbound bigint NOT NULL CHECK (reliable_inbound >= 0),
  sales_quantity bigint NOT NULL CHECK (sales_quantity >= 0),
  sales_window_days integer NOT NULL CHECK (sales_window_days > 0),
  average_daily_sales numeric(19,4) NOT NULL CHECK (average_daily_sales >= 0),
  lead_time_demand bigint NOT NULL CHECK (lead_time_demand >= 0),
  safety_stock_quantity bigint NOT NULL CHECK (safety_stock_quantity >= 0),
  reorder_point bigint NOT NULL CHECK (reorder_point >= 0),
  coverage_demand bigint NOT NULL CHECK (coverage_demand >= 0),
  raw_suggestion_quantity bigint NOT NULL CHECK (raw_suggestion_quantity >= 0),
  suggested_quantity bigint NOT NULL CHECK (suggested_quantity >= 0),
  order_multiple bigint NOT NULL CHECK (order_multiple > 0),
  explanation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (replenishment_run_id, reorder_policy_id),
  CHECK (active_reservation <= sellable_on_hand),
  CHECK (atp = sellable_on_hand - active_reservation),
  CHECK (reorder_point = lead_time_demand + safety_stock_quantity),
  CHECK (suggested_quantity = 0 OR suggested_quantity % order_multiple = 0)
);

CREATE TABLE planning.draft_purchase_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_code text NOT NULL UNIQUE CHECK (draft_code = upper(btrim(draft_code))),
  replenishment_result_id uuid NOT NULL UNIQUE REFERENCES planning.replenishment_result(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES purchasing.supplier(id) ON DELETE RESTRICT,
  suggestion_date date NOT NULL,
  requested_quantity bigint NOT NULL CHECK (requested_quantity > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','CANCELLED','CONVERTED')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  input_snapshot jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, sku_id, suggestion_date)
);

CREATE INDEX ix_reorder_policy_effective ON planning.reorder_policy (warehouse_id, valid_from, valid_until, status);
CREATE INDEX ix_replenishment_result_sku ON planning.replenishment_result (warehouse_id, sku_id, created_at DESC);
CREATE INDEX ix_draft_purchase_request_status ON planning.draft_purchase_request (warehouse_id, status, suggestion_date DESC);

CREATE TABLE reporting.inventory_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL UNIQUE REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  document_type text NOT NULL,
  document_id uuid NOT NULL,
  quantity bigint NOT NULL CHECK (quantity > 0),
  source_warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  destination_warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  unit_cost numeric(19,4) NOT NULL CHECK (unit_cost >= 0),
  extended_cost numeric(24,4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  cost_method text NOT NULL DEFAULT 'BATCH_ACTUAL' CHECK (cost_method IN ('BATCH_ACTUAL','UNVALUED')),
  reversal_of uuid REFERENCES reporting.inventory_cost_ledger(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_cost_ledger_sku_batch_time ON reporting.inventory_cost_ledger (sku_id, batch_id, occurred_at DESC);
CREATE INDEX ix_cost_ledger_warehouse_time ON reporting.inventory_cost_ledger (destination_warehouse_id, source_warehouse_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reporting.resolve_batch_unit_cost(p_sku_id uuid, p_batch_id uuid, p_occurred_at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((
    SELECT po_line.unit_price
    FROM receiving.goods_receipt_line receipt_line
    JOIN receiving.goods_receipt receipt ON receipt.id = receipt_line.gr_id AND receipt.status IN ('RECEIVING','POSTED')
    JOIN purchasing.purchase_order_line po_line ON po_line.id = receipt_line.po_line_id
    WHERE receipt_line.sku_id = p_sku_id
      AND receipt_line.batch_id = p_batch_id
      AND receipt.received_date <= p_occurred_at
    ORDER BY receipt.received_date DESC, receipt_line.id
    LIMIT 1
  ), 0::numeric);
$$;

CREATE OR REPLACE FUNCTION reporting.capture_inventory_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit_cost numeric(19,4);
  v_reversal_cost_id uuid;
BEGIN
  IF NEW.reversal_of IS NOT NULL THEN
    SELECT id, unit_cost INTO v_reversal_cost_id, v_unit_cost
    FROM reporting.inventory_cost_ledger WHERE movement_id = NEW.reversal_of;
  END IF;
  v_unit_cost := coalesce(v_unit_cost, reporting.resolve_batch_unit_cost(NEW.sku_id, NEW.batch_id, NEW.occurred_at), 0);
  INSERT INTO reporting.inventory_cost_ledger (
    movement_id, sku_id, batch_id, movement_type, document_type, document_id, quantity,
    source_warehouse_id, destination_warehouse_id, unit_cost, cost_method, reversal_of, occurred_at
  ) VALUES (
    NEW.id, NEW.sku_id, NEW.batch_id, NEW.movement_type, NEW.document_type, NEW.document_id, NEW.quantity,
    NEW.source_warehouse_id, NEW.destination_warehouse_id, v_unit_cost,
    CASE WHEN v_unit_cost > 0 THEN 'BATCH_ACTUAL' ELSE 'UNVALUED' END, v_reversal_cost_id, NEW.occurred_at
  ) ON CONFLICT (movement_id) DO NOTHING;
  RETURN NEW;
END;
$$;

INSERT INTO reporting.inventory_cost_ledger (
  movement_id, sku_id, batch_id, movement_type, document_type, document_id, quantity,
  source_warehouse_id, destination_warehouse_id, unit_cost, cost_method, reversal_of, occurred_at
)
SELECT movement.id, movement.sku_id, movement.batch_id, movement.movement_type, movement.document_type,
       movement.document_id, movement.quantity, movement.source_warehouse_id, movement.destination_warehouse_id,
       reporting.resolve_batch_unit_cost(movement.sku_id, movement.batch_id, movement.occurred_at),
       CASE WHEN reporting.resolve_batch_unit_cost(movement.sku_id, movement.batch_id, movement.occurred_at) > 0
            THEN 'BATCH_ACTUAL' ELSE 'UNVALUED' END,
       NULL, movement.occurred_at
FROM inventory.inventory_movement_ledger movement
ON CONFLICT (movement_id) DO NOTHING;

UPDATE reporting.inventory_cost_ledger reversal_cost
SET reversal_of = original_cost.id,
    unit_cost = original_cost.unit_cost,
    cost_method = original_cost.cost_method
FROM inventory.inventory_movement_ledger reversal_movement
JOIN reporting.inventory_cost_ledger original_cost ON original_cost.movement_id = reversal_movement.reversal_of
WHERE reversal_cost.movement_id = reversal_movement.id AND reversal_cost.reversal_of IS NULL;

CREATE TRIGGER trg_inventory_capture_cost
AFTER INSERT ON inventory.inventory_movement_ledger
FOR EACH ROW EXECUTE FUNCTION reporting.capture_inventory_cost();

CREATE TRIGGER trg_inventory_cost_append_only
BEFORE UPDATE OR DELETE ON reporting.inventory_cost_ledger
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE VIEW reporting.inventory_position AS
SELECT balance.sku_id, sku.code AS sku_code, sku.name AS sku_name, product.brand_id,
       balance.batch_id, batch.batch_code, batch.expiration_date,
       balance.warehouse_id, balance.location_id, balance.stock_status,
       balance.quantity_on_hand, balance.updated_at
FROM inventory.inventory_balance balance
JOIN catalog.sku sku ON sku.id = balance.sku_id
JOIN catalog.product product ON product.id = sku.product_id
JOIN inventory.batch batch ON batch.id = balance.batch_id;

CREATE VIEW reporting.inventory_value_current AS
SELECT position.*,
       coalesce(cost.unit_cost, 0::numeric)::numeric(19,4) AS unit_cost,
       (position.quantity_on_hand * coalesce(cost.unit_cost, 0::numeric))::numeric(24,4) AS inventory_value,
       CASE WHEN coalesce(cost.unit_cost, 0::numeric) > 0 THEN 'VALUED' ELSE 'UNVALUED' END AS valuation_status
FROM reporting.inventory_position position
LEFT JOIN LATERAL (
  SELECT ledger.unit_cost
  FROM reporting.inventory_cost_ledger ledger
  WHERE ledger.sku_id = position.sku_id AND ledger.batch_id = position.batch_id
  ORDER BY ledger.occurred_at DESC, ledger.id DESC
  LIMIT 1
) cost ON true;

CREATE TABLE reporting.report_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('DASHBOARD','INVENTORY_ACTIVITY','QUALITY_RECALL','SUPPLIER_KPI','INVENTORY_VALUE')),
  warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot jsonb NOT NULL,
  source_cutoff timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reporting.report_export (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL UNIQUE REFERENCES reporting.report_run(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED','EXPIRED')),
  content_type text NOT NULL DEFAULT 'application/json',
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  content text NOT NULL,
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX ix_report_run_type_time ON reporting.report_run (report_type, created_at DESC);
CREATE INDEX ix_report_run_warehouse_time ON reporting.report_run (warehouse_id, created_at DESC);
CREATE TRIGGER trg_report_run_append_only BEFORE UPDATE OR DELETE ON reporting.report_run
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

ALTER TABLE platform.outbox_event
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  ADD COLUMN processing_started_at timestamptz;

CREATE TABLE integration.integration_endpoint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  system_type text NOT NULL CHECK (system_type IN ('POS','ERP','ACCOUNTING','ECOMMERCE','NOTIFICATION','TEST')),
  transport text NOT NULL DEFAULT 'HTTP' CHECK (transport IN ('HTTP','MOCK')),
  endpoint_url text,
  secret_reference text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  base_backoff_seconds integer NOT NULL DEFAULT 5 CHECK (base_backoff_seconds > 0),
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key),
  CHECK ((transport = 'HTTP' AND endpoint_url IS NOT NULL AND btrim(endpoint_url) <> '') OR transport = 'MOCK')
);

CREATE TABLE integration.outbox_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES integration.integration_endpoint(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_type)
);

CREATE TABLE integration.outbox_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES platform.outbox_event(id) ON DELETE RESTRICT,
  endpoint_id uuid NOT NULL REFERENCES integration.integration_endpoint(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED','DEAD_LETTER')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  cycle_attempts integer NOT NULL DEFAULT 0 CHECK (cycle_attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, endpoint_id)
);

CREATE TABLE integration.outbox_delivery_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES integration.outbox_delivery(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('PUBLISHED','FAILED','DEAD_LETTER')),
  response_status integer,
  error_message text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, attempt_number),
  CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599)
);

CREATE TABLE integration.outbox_replay (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES platform.outbox_event(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  correlation_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_delivery_ready ON integration.outbox_delivery (available_at, created_at)
  WHERE status IN ('PENDING','FAILED');
CREATE INDEX ix_delivery_dead_letter ON integration.outbox_delivery (updated_at DESC)
  WHERE status = 'DEAD_LETTER';
CREATE INDEX ix_delivery_event ON integration.outbox_delivery (event_id, status);
CREATE INDEX ix_outbox_processing_recovery ON platform.outbox_event (processing_started_at)
  WHERE status = 'PROCESSING';

CREATE TRIGGER trg_delivery_attempt_append_only
BEFORE UPDATE OR DELETE ON integration.outbox_delivery_attempt
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TRIGGER trg_outbox_replay_append_only
BEFORE UPDATE OR DELETE ON integration.outbox_replay
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

COMMENT ON TABLE planning.replenishment_result IS 'Immutable ROP and purchase suggestion inputs/outputs; Planning never creates an approved PO.';
COMMENT ON TABLE planning.draft_purchase_request IS 'At most one draft per SKU, warehouse and suggestion date; purchasing approval remains external.';
COMMENT ON TABLE reporting.inventory_cost_ledger IS 'Append-only valuation companion to the canonical Inventory movement ledger.';
COMMENT ON VIEW reporting.inventory_value_current IS 'Current whole-case balance valued by batch actual cost; unvalued stock remains explicit.';
COMMENT ON TABLE integration.outbox_delivery IS 'Per-endpoint at-least-once delivery state with bounded retry and dead-letter handling.';
