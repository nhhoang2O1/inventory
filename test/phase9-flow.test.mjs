import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../packages/database/migrations/0015_phase9_planning_reporting.sql', import.meta.url), 'utf8');
const planning = await readFile(new URL('../apps/api/src/modules/planning/public/planning.service.ts', import.meta.url), 'utf8');
const reporting = await readFile(new URL('../apps/api/src/modules/reporting/public/reporting.service.ts', import.meta.url), 'utf8');
const integration = await readFile(new URL('../apps/api/src/modules/integration/public/integration.service.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('../apps/worker/src/outbox-processor.ts', import.meta.url), 'utf8');

test('Phase 9 migration owns planning, reporting cost and integration delivery state', () => {
  for (const table of [
    'planning.reorder_policy',
    'planning.replenishment_run',
    'planning.replenishment_result',
    'planning.draft_purchase_request',
    'reporting.inventory_cost_ledger',
    'reporting.report_run',
    'integration.integration_endpoint',
    'integration.outbox_delivery',
    'integration.outbox_delivery_attempt',
    'integration.outbox_replay'
  ]) assert.match(migration, new RegExp(`CREATE TABLE ${table.replace('.', '\\.')}`));
  assert.match(migration, /uq_reorder_policy_current/);
  assert.match(migration, /UNIQUE \(warehouse_id, sku_id, suggestion_date\)/);
  assert.match(migration, /trg_inventory_cost_append_only/);
});

test('Phase 9 planning is deterministic, whole-case and does not create an approved PO', () => {
  assert.match(planning, /Math\.ceil\(averageDailySales \* policy\.lead_time_days\)/);
  assert.match(planning, /Math\.ceil\(rawSuggestion \/ orderMultiple\) \* orderMultiple/);
  assert.match(planning, /ON CONFLICT \(warehouse_id,sku_id,suggestion_date\) DO NOTHING/);
  assert.match(planning, /planning\.draft_purchase_request/);
  assert.doesNotMatch(planning, /INSERT INTO purchasing\.purchase_order/);
  assert.doesNotMatch(planning, /(INSERT INTO|UPDATE|DELETE FROM) inventory\.inventory_balance/);
});

test('Phase 9 reports disclose KPI formulas and cost access stays permission separated', () => {
  assert.match(reporting, /fillRateCap/);
  assert.match(reporting, /Math\.min\(acceptedByPromise, line\.orderedQuantity\)/);
  assert.match(reporting, /REPORTING\.VIEW_COST/);
  assert.match(reporting, /reporting\.inventory_value_current/);
  assert.match(reporting, /result_snapshot/);
});

test('Phase 9 integration uses bounded retry, dead-letter and audited replay', () => {
  assert.match(worker, /cycleAttempt >= message\.maxAttempts/);
  assert.match(worker, /DEAD_LETTER/);
  assert.match(worker, /2 \*\* Math\.max\(message\.cycleAttempt - 1, 0\)/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(integration, /INTEGRATION\.REPLAY/);
  assert.match(integration, /INSERT INTO audit\.audit_event/);
  assert.match(integration, /cycle_attempts=0/);
});
