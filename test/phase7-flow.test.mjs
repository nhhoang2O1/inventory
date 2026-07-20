import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../packages/database/migrations/0013_phase7_transfer_stocktake.sql', import.meta.url),
  'utf8'
);
const transferService = await readFile(
  new URL('../apps/api/src/modules/transfer/public/transfer.service.ts', import.meta.url),
  'utf8'
);
const stocktakeService = await readFile(
  new URL('../apps/api/src/modules/stocktake/public/stocktake.service.ts', import.meta.url),
  'utf8'
);
const reversalService = await readFile(
  new URL('../apps/api/src/modules/adjustment/public/reversal.service.ts', import.meta.url),
  'utf8'
);

test('Phase 7 migration defines transfer, blind stocktake, adjustment and reversal ownership', () => {
  for (const table of [
    'transfer.stock_transfer',
    'transfer.transfer_receipt',
    'transfer.transfer_discrepancy',
    'stocktake.stocktake_session',
    'stocktake.stocktake_snapshot_line',
    'stocktake.stocktake_count_entry',
    'adjustment.inventory_adjustment',
    'adjustment.reversal_request',
    'adjustment.reversal_line'
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table.replace('.', '\\.')}`));
  }
  assert.match(migration, /IN_TRANSIT/);
  assert.match(migration, /blind_count boolean NOT NULL DEFAULT true/);
  assert.match(migration, /trg_stocktake_count_append_only/);
  assert.match(migration, /uq_inventory_single_reversal|original_movement_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /pick_idempotency_key text UNIQUE/);
});

test('Phase 7 state transitions and stocktake lock are enforced in the database', () => {
  assert.match(migration, /DRAFT.*APPROVED.*CANCELLED/s);
  assert.match(migration, /PICKING.*IN_TRANSIT.*RECEIVED/s);
  assert.match(migration, /PLANNED.*COUNTING.*CANCELLED/s);
  assert.match(migration, /COUNTING.*RECOUNT.*RECONCILED/s);
  assert.match(migration, /PENDING_APPROVAL.*POSTED/s);
  assert.match(migration, /INVENTORY_LOCATION_STOCKTAKE_LOCKED/);
  assert.match(migration, /IF NEW\.document_type = 'INVENTORY_ADJUSTMENT' THEN RETURN NEW/);
});

test('Phase 7 services post through the canonical Inventory Core contract', () => {
  assert.match(transferService, /inventory\.post_movement/);
  assert.match(transferService, /pick_result_version/);
  assert.match(stocktakeService, /inventory\.post_movement/);
  assert.match(reversalService, /inventory\.post_movement/);
  for (const source of [transferService, stocktakeService, reversalService]) {
    assert.doesNotMatch(source, /UPDATE inventory\.inventory_balance/);
    assert.doesNotMatch(source, /INSERT INTO inventory\.inventory_balance/);
  }
  assert.match(reversalService, /reversal_of/);
  assert.match(stocktakeService, /Creator cannot approve|Counter cannot approve/);
  assert.match(stocktakeService, /Poster must be independent/);
});
