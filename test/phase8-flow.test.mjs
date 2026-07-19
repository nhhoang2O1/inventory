import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../packages/database/migrations/0014_phase8_quality_recall.sql', import.meta.url), 'utf8');
const qualityService = await readFile(new URL('../apps/api/src/modules/quality/public/quality.service.ts', import.meta.url), 'utf8');
const returnService = await readFile(new URL('../apps/api/src/modules/quality/public/customer-return.service.ts', import.meta.url), 'utf8');
const recallService = await readFile(new URL('../apps/api/src/modules/recall/public/recall.service.ts', import.meta.url), 'utf8');

test('Phase 8 migration owns quality, returns, expiry and recall workflows', () => {
  for (const table of [
    'quality.quality_case',
    'quality.quality_case_line',
    'quality.quality_disposition',
    'quality.customer_return',
    'quality.expiry_run',
    'recall.recall_case',
    'recall.recall_scope'
  ]) assert.match(migration, new RegExp(`CREATE TABLE ${table.replace('.', '\\.')}`));
  assert.match(migration, /QUALITY\.HOLD/);
  assert.match(migration, /RETURN\.POST/);
  assert.match(migration, /RECALL\.CONTAIN/);
});

test('Phase 8 database enforces workflow transitions and active recall containment', () => {
  assert.match(migration, /QUALITY_INVALID_STATE_TRANSITION/);
  assert.match(migration, /QUALITY_DISPOSITION_INVALID_STATE_TRANSITION/);
  assert.match(migration, /RETURN_INVALID_STATE_TRANSITION/);
  assert.match(migration, /RECALL_INVALID_STATE_TRANSITION/);
  assert.match(migration, /uq_active_recall_batch/);
  assert.match(migration, /RECALL_ACTIVE_BATCH_BLOCKED/);
  assert.match(migration, /NEW\.destination_status IS DISTINCT FROM 'RECALLED'/);
});

test('Phase 8 application services use only the Inventory Core posting contract', () => {
  for (const source of [qualityService, returnService, recallService]) {
    assert.match(source, /inventory\.post_movement/);
    assert.doesNotMatch(source, /UPDATE inventory\.inventory_balance/);
    assert.doesNotMatch(source, /INSERT INTO inventory\.inventory_balance/);
    assert.doesNotMatch(source, /DELETE FROM inventory\.inventory_balance/);
  }
  assert.match(qualityService, /Poster must be independent/);
  assert.match(returnService, /poster must be independent/i);
  assert.match(recallService, /containment actor must be independent/i);
});
