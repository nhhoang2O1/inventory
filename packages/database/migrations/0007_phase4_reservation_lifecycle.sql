CREATE OR REPLACE FUNCTION inventory.fulfill_reservation(p_reservation_id uuid, p_quantity bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v inventory.inventory_reservation%ROWTYPE; v_remaining bigint;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'fulfillment quantity must be positive'; END IF;
  SELECT * INTO v FROM inventory.inventory_reservation WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  IF v.status <> 'ACTIVE' THEN RAISE EXCEPTION 'reservation is not active'; END IF;
  v_remaining := v.quantity_reserved-v.quantity_fulfilled-v.quantity_released;
  IF p_quantity > v_remaining THEN RAISE EXCEPTION 'fulfillment exceeds active reservation'; END IF;
  UPDATE inventory.inventory_reservation
     SET quantity_fulfilled=quantity_fulfilled+p_quantity,
         status=CASE WHEN p_quantity=v_remaining THEN 'FULFILLED' ELSE status END,
         version=version+1,updated_at=now()
   WHERE id=p_reservation_id;
END; $$;

CREATE OR REPLACE FUNCTION inventory.expire_reservations(p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  UPDATE inventory.inventory_reservation
     SET quantity_released=quantity_reserved-quantity_fulfilled,
         status='EXPIRED',version=version+1,updated_at=p_now
   WHERE status='ACTIVE' AND expires_at IS NOT NULL AND expires_at<=p_now;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END; $$;

COMMENT ON FUNCTION inventory.fulfill_reservation IS 'Must be called in the same application transaction as the POSTED issue movement.';
COMMENT ON FUNCTION inventory.expire_reservations IS 'Idempotently releases expired reservation overlay without creating inventory movement.';
