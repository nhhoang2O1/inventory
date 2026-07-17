CREATE UNIQUE INDEX uq_inventory_single_reversal
  ON inventory.inventory_movement_ledger(reversal_of)
  WHERE reversal_of IS NOT NULL;
COMMENT ON INDEX inventory.uq_inventory_single_reversal IS 'An original movement can be reversed at most once; reversal is a new append-only movement.';
