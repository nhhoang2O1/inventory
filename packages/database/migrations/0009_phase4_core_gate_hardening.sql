DROP FUNCTION inventory.fulfill_reservation(uuid,bigint);
CREATE FUNCTION inventory.fulfill_reservation(p_reservation_id uuid,p_sku_id uuid,p_warehouse_id uuid,p_quantity bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v inventory.inventory_reservation%ROWTYPE; v_remaining bigint;
BEGIN
  IF p_quantity<=0 THEN RAISE EXCEPTION 'fulfillment quantity must be positive'; END IF;
  SELECT * INTO v FROM inventory.inventory_reservation WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  IF v.status<>'ACTIVE' THEN RAISE EXCEPTION 'reservation is not active'; END IF;
  IF v.sku_id<>p_sku_id OR v.warehouse_id<>p_warehouse_id THEN RAISE EXCEPTION 'reservation allocation scope mismatch'; END IF;
  v_remaining:=v.quantity_reserved-v.quantity_fulfilled-v.quantity_released;
  IF p_quantity>v_remaining THEN RAISE EXCEPTION 'fulfillment exceeds active reservation'; END IF;
  UPDATE inventory.inventory_reservation SET quantity_fulfilled=quantity_fulfilled+p_quantity,
    status=CASE WHEN p_quantity=v_remaining THEN 'FULFILLED' ELSE status END,version=version+1,updated_at=now()
  WHERE id=p_reservation_id;
END; $$;

CREATE OR REPLACE FUNCTION inventory.reject_negative_atp()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_on_hand bigint;v_reserved bigint;
BEGIN
  IF NEW.stock_status<>'AVAILABLE' THEN RETURN NEW; END IF;
  SELECT coalesce(sum(quantity_on_hand),0) INTO v_on_hand FROM inventory.inventory_balance
   WHERE sku_id=NEW.sku_id AND warehouse_id=NEW.warehouse_id AND stock_status='AVAILABLE';
  SELECT coalesce(sum(quantity_reserved-quantity_fulfilled-quantity_released),0) INTO v_reserved
   FROM inventory.inventory_reservation WHERE sku_id=NEW.sku_id AND warehouse_id=NEW.warehouse_id
   AND status='ACTIVE' AND (expires_at IS NULL OR expires_at>now());
  IF v_on_hand<v_reserved THEN RAISE EXCEPTION 'INVENTORY_ATP_NEGATIVE'; END IF;
  RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER trg_inventory_balance_nonnegative_atp
AFTER INSERT OR UPDATE OF quantity_on_hand ON inventory.inventory_balance
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION inventory.reject_negative_atp();

CREATE VIEW inventory.in_transit_summary AS
SELECT sku_id,batch_id,sum(quantity_on_hand)::bigint quantity_in_transit
FROM inventory.inventory_balance WHERE stock_status='IN_TRANSIT' GROUP BY sku_id,batch_id;
