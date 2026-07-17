CREATE TABLE inventory.stock_status (
  code text PRIMARY KEY CHECK (code IN ('AVAILABLE','BLOCKED','QUARANTINED','DAMAGED','EXPIRED','RECALLED','IN_TRANSIT')),
  sellable boolean NOT NULL, enterprise_owned boolean NOT NULL DEFAULT true
);
INSERT INTO inventory.stock_status(code,sellable) VALUES
 ('AVAILABLE',true),('BLOCKED',false),('QUARANTINED',false),('DAMAGED',false),('EXPIRED',false),('RECALLED',false),('IN_TRANSIT',false);

CREATE TABLE inventory.batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_code text NOT NULL CHECK (btrim(batch_code)<>''), manufacturing_date date NOT NULL, expiration_date date NOT NULL,
  first_received_date date, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (manufacturing_date < expiration_date), UNIQUE(sku_id,batch_code)
);
CREATE TABLE inventory.inventory_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES inventory.batch(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  stock_status text NOT NULL REFERENCES inventory.stock_status(code), quantity_on_hand bigint NOT NULL DEFAULT 0 CHECK(quantity_on_hand>=0),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sku_id,batch_id,warehouse_id,location_id,stock_status)
);
CREATE TABLE inventory.inventory_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), demand_type text NOT NULL, demand_id uuid NOT NULL,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT, warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES inventory.batch(id) ON DELETE RESTRICT, location_id uuid REFERENCES warehouse.location(id) ON DELETE RESTRICT,
  quantity_reserved bigint NOT NULL CHECK(quantity_reserved>0), quantity_fulfilled bigint NOT NULL DEFAULT 0 CHECK(quantity_fulfilled>=0),
  quantity_released bigint NOT NULL DEFAULT 0 CHECK(quantity_released>=0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','FULFILLED','RELEASED','EXPIRED','CANCELLED')),
  expires_at timestamptz, idempotency_key text NOT NULL, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(quantity_fulfilled+quantity_released<=quantity_reserved), UNIQUE(demand_type,demand_id,idempotency_key)
);
CREATE INDEX ix_reservation_active ON inventory.inventory_reservation(sku_id,warehouse_id,expires_at) WHERE status='ACTIVE';

CREATE TABLE inventory.inventory_movement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movement_type text NOT NULL
    CHECK(movement_type IN ('RECEIPT','ISSUE','TRANSFER','STATUS_CHANGE','ADJUSTMENT','RETURN','REVERSAL')),
  document_type text NOT NULL, document_id uuid NOT NULL, command_key text NOT NULL,
  sku_id uuid NOT NULL REFERENCES catalog.sku(id), batch_id uuid NOT NULL REFERENCES inventory.batch(id), quantity bigint NOT NULL CHECK(quantity>0),
  source_warehouse_id uuid REFERENCES warehouse.warehouse(id), source_location_id uuid REFERENCES warehouse.location(id), source_status text REFERENCES inventory.stock_status(code),
  destination_warehouse_id uuid REFERENCES warehouse.warehouse(id), destination_location_id uuid REFERENCES warehouse.location(id), destination_status text REFERENCES inventory.stock_status(code),
  reversal_of uuid REFERENCES inventory.inventory_movement_ledger(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES iam.app_user(id), correlation_id uuid NOT NULL, reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_location_id IS NOT NULL AND source_warehouse_id IS NOT NULL AND source_status IS NOT NULL) OR
         (destination_location_id IS NOT NULL AND destination_warehouse_id IS NOT NULL AND destination_status IS NOT NULL)),
  UNIQUE(document_type,document_id,command_key)
);
CREATE INDEX ix_movement_sku_batch_time ON inventory.inventory_movement_ledger(sku_id,batch_id,occurred_at);
CREATE TRIGGER trg_inventory_movement_append_only BEFORE UPDATE OR DELETE ON inventory.inventory_movement_ledger
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE VIEW inventory.atp_by_sku_warehouse AS
WITH on_hand AS (
 SELECT b.sku_id,b.warehouse_id,sum(b.quantity_on_hand)::bigint sellable_on_hand
 FROM inventory.inventory_balance b JOIN inventory.stock_status s ON s.code=b.stock_status AND s.sellable
 GROUP BY b.sku_id,b.warehouse_id
), reserved AS (
 SELECT sku_id,warehouse_id,sum(quantity_reserved-quantity_fulfilled-quantity_released)::bigint active_reservation
 FROM inventory.inventory_reservation WHERE status='ACTIVE' AND (expires_at IS NULL OR expires_at>now()) GROUP BY sku_id,warehouse_id
)
SELECT coalesce(o.sku_id,r.sku_id) sku_id,coalesce(o.warehouse_id,r.warehouse_id) warehouse_id,
 coalesce(o.sellable_on_hand,0)::bigint sellable_on_hand,coalesce(r.active_reservation,0)::bigint active_reservation,
 (coalesce(o.sellable_on_hand,0)-coalesce(r.active_reservation,0))::bigint atp
FROM on_hand o FULL JOIN reserved r USING(sku_id,warehouse_id);

CREATE OR REPLACE FUNCTION inventory.reserve_inventory(p_demand_type text,p_demand_id uuid,p_sku_id uuid,p_warehouse_id uuid,p_quantity bigint,p_expires_at timestamptz,p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_atp bigint; v_id uuid;
BEGIN
 IF p_quantity<=0 THEN RAISE EXCEPTION 'reservation quantity must be positive'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_sku_id::text||p_warehouse_id::text,0));
 SELECT id INTO v_id FROM inventory.inventory_reservation WHERE demand_type=p_demand_type AND demand_id=p_demand_id AND idempotency_key=p_idempotency_key;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT coalesce(atp,0) INTO v_atp FROM inventory.atp_by_sku_warehouse WHERE sku_id=p_sku_id AND warehouse_id=p_warehouse_id;
 IF coalesce(v_atp,0)<p_quantity THEN RAISE EXCEPTION 'INVENTORY_ATP_INSUFFICIENT'; END IF;
 INSERT INTO inventory.inventory_reservation(demand_type,demand_id,sku_id,warehouse_id,quantity_reserved,expires_at,idempotency_key)
 VALUES(p_demand_type,p_demand_id,p_sku_id,p_warehouse_id,p_quantity,p_expires_at,p_idempotency_key) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION inventory.release_reservation(p_reservation_id uuid,p_quantity bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v inventory.inventory_reservation%ROWTYPE; v_release bigint;
BEGIN
 SELECT * INTO v FROM inventory.inventory_reservation WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'ACTIVE' THEN RETURN; END IF;
 v_release:=least(p_quantity,v.quantity_reserved-v.quantity_fulfilled-v.quantity_released);
 IF v_release<=0 THEN RETURN; END IF;
 UPDATE inventory.inventory_reservation SET quantity_released=quantity_released+v_release,
 status=CASE WHEN quantity_fulfilled+quantity_released+v_release=quantity_reserved THEN 'RELEASED' ELSE status END,
 version=version+1,updated_at=now() WHERE id=p_reservation_id;
END; $$;

CREATE OR REPLACE FUNCTION inventory.post_movement(
 p_movement_type text,p_document_type text,p_document_id uuid,p_command_key text,p_sku_id uuid,p_batch_id uuid,p_quantity bigint,
 p_source_warehouse_id uuid,p_source_location_id uuid,p_source_status text,p_destination_warehouse_id uuid,p_destination_location_id uuid,p_destination_status text,
 p_actor_id uuid,p_correlation_id uuid,p_reason text,p_reversal_of uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_rows integer;
BEGIN
 IF p_quantity<=0 OR p_quantity<>trunc(p_quantity) THEN RAISE EXCEPTION 'whole-case positive integer required'; END IF;
 SELECT id INTO v_id FROM inventory.inventory_movement_ledger WHERE document_type=p_document_type AND document_id=p_document_id AND command_key=p_command_key;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_sku_id::text||p_batch_id::text,0));
 IF p_source_location_id IS NOT NULL THEN
  UPDATE inventory.inventory_balance SET quantity_on_hand=quantity_on_hand-p_quantity,version=version+1,updated_at=now()
   WHERE sku_id=p_sku_id AND batch_id=p_batch_id AND warehouse_id=p_source_warehouse_id AND location_id=p_source_location_id AND stock_status=p_source_status AND quantity_on_hand>=p_quantity;
  GET DIAGNOSTICS v_rows=ROW_COUNT; IF v_rows<>1 THEN RAISE EXCEPTION 'INVENTORY_ON_HAND_INSUFFICIENT'; END IF;
 END IF;
 IF p_destination_location_id IS NOT NULL THEN
  INSERT INTO inventory.inventory_balance(sku_id,batch_id,warehouse_id,location_id,stock_status,quantity_on_hand)
  VALUES(p_sku_id,p_batch_id,p_destination_warehouse_id,p_destination_location_id,p_destination_status,p_quantity)
  ON CONFLICT(sku_id,batch_id,warehouse_id,location_id,stock_status) DO UPDATE SET quantity_on_hand=inventory.inventory_balance.quantity_on_hand+excluded.quantity_on_hand,version=inventory.inventory_balance.version+1,updated_at=now();
 END IF;
 INSERT INTO inventory.inventory_movement_ledger(movement_type,document_type,document_id,command_key,sku_id,batch_id,quantity,source_warehouse_id,source_location_id,source_status,destination_warehouse_id,destination_location_id,destination_status,actor_id,correlation_id,reason,reversal_of)
 VALUES(p_movement_type,p_document_type,p_document_id,p_command_key,p_sku_id,p_batch_id,p_quantity,p_source_warehouse_id,p_source_location_id,p_source_status,p_destination_warehouse_id,p_destination_location_id,p_destination_status,p_actor_id,p_correlation_id,p_reason,p_reversal_of) RETURNING id INTO v_id;
 INSERT INTO platform.outbox_event(aggregate_type,aggregate_id,event_type,payload,correlation_id) VALUES('INVENTORY_MOVEMENT',v_id,'INVENTORY_MOVEMENT_POSTED',jsonb_build_object('movementId',v_id),p_correlation_id);
 INSERT INTO audit.audit_event(actor_id,action,resource_type,resource_id,warehouse_id,correlation_id,reason,after_data) VALUES(p_actor_id,'POST','INVENTORY_MOVEMENT',v_id::text,coalesce(p_destination_warehouse_id,p_source_warehouse_id),p_correlation_id,p_reason,jsonb_build_object('quantity',p_quantity));
 RETURN v_id;
END; $$;

CREATE VIEW inventory.ledger_balance_reconciliation AS
WITH delta AS (
 SELECT sku_id,batch_id,source_warehouse_id warehouse_id,source_location_id location_id,source_status stock_status,-sum(quantity)::bigint ledger_quantity FROM inventory.inventory_movement_ledger WHERE source_location_id IS NOT NULL GROUP BY 1,2,3,4,5
 UNION ALL
 SELECT sku_id,batch_id,destination_warehouse_id,destination_location_id,destination_status,sum(quantity)::bigint FROM inventory.inventory_movement_ledger WHERE destination_location_id IS NOT NULL GROUP BY 1,2,3,4,5
), summed AS (SELECT sku_id,batch_id,warehouse_id,location_id,stock_status,sum(ledger_quantity)::bigint ledger_quantity FROM delta GROUP BY 1,2,3,4,5)
SELECT b.sku_id,b.batch_id,b.warehouse_id,b.location_id,b.stock_status,b.quantity_on_hand,coalesce(s.ledger_quantity,0) ledger_quantity,
 b.quantity_on_hand-coalesce(s.ledger_quantity,0) variance
FROM inventory.inventory_balance b LEFT JOIN summed s USING(sku_id,batch_id,warehouse_id,location_id,stock_status);
