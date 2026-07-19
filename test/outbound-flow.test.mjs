import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  planFefo,
  requiresFefoOverride,
  sortFefoCandidates,
  validateManualAllocation
} from '../apps/api/dist/modules/outbound/public/fefo-allocation.js';

const migration = await readFile(
  new URL('../packages/database/migrations/0012_phase6_outbound.sql', import.meta.url),
  'utf8'
);
const service = await readFile(
  new URL('../apps/api/src/modules/outbound/public/outbound.service.ts', import.meta.url),
  'utf8'
);
const controller = await readFile(
  new URL('../apps/api/src/modules/outbound/public/outbound.controller.ts', import.meta.url),
  'utf8'
);
const openapi = await readFile(
  new URL('../docs/openapi/outbound-v1.yaml', import.meta.url),
  'utf8'
);

const candidates = [
  {
    balanceId: 'balance-late',
    batchId: 'batch-late',
    locationId: 'location-a',
    expirationDate: '2027-05-01',
    firstReceivedDate: '2026-02-01',
    allocatableQuantity: 60
  },
  {
    balanceId: 'balance-early-new',
    batchId: 'batch-early-new',
    locationId: 'location-b',
    expirationDate: '2027-04-01',
    firstReceivedDate: '2026-02-10',
    allocatableQuantity: 40
  },
  {
    balanceId: 'balance-early-old',
    batchId: 'batch-early-old',
    locationId: 'location-c',
    expirationDate: '2027-04-01',
    firstReceivedDate: '2026-01-10',
    allocatableQuantity: 30
  }
];

test('FEFO sorts by expiration then first receipt with deterministic tie-breaks', () => {
  assert.deepEqual(
    sortFefoCandidates(candidates).map((candidate) => candidate.batchId),
    ['batch-early-old', 'batch-early-new', 'batch-late']
  );
});

test('FEFO splits a whole-case request across the earliest eligible sources', () => {
  assert.deepEqual(
    planFefo(candidates, 60).map(({ batchId, quantity, fefoRank }) => ({ batchId, quantity, fefoRank })),
    [
      { batchId: 'batch-early-old', quantity: 30, fefoRank: 1 },
      { batchId: 'batch-early-new', quantity: 30, fefoRank: 2 }
    ]
  );
});

test('FEFO rejects insufficient and fractional whole-case allocations', () => {
  assert.throws(() => planFefo(candidates, 131), /OUTBOUND_FEFO_STOCK_INSUFFICIENT/);
  assert.throws(() => planFefo(candidates, 1.5), /positive whole case/);
});

test('manual non-FEFO selection requires override while the suggested plan does not', () => {
  const automatic = planFefo(candidates, 30);
  const same = validateManualAllocation(candidates, 30, [
    { batchId: 'batch-early-old', locationId: 'location-c', quantity: 30 }
  ]);
  const overridden = validateManualAllocation(candidates, 30, [
    { batchId: 'batch-late', locationId: 'location-a', quantity: 30 }
  ]);
  assert.equal(requiresFefoOverride(automatic, same), false);
  assert.equal(requiresFefoOverride(automatic, overridden), true);
});

test('manual allocation must use eligible stock and cover the full request', () => {
  assert.throws(
    () => validateManualAllocation(candidates, 30, [
      { batchId: 'unknown', locationId: 'location-a', quantity: 30 }
    ]),
    /ineligible/
  );
  assert.throws(
    () => validateManualAllocation(candidates, 30, [
      { batchId: 'batch-early-old', locationId: 'location-c', quantity: 20 }
    ]),
    /full requested quantity/
  );
});

test('Phase 6 migration owns outbound documents without introducing RESERVED stock', () => {
  for (const table of [
    'outbound.issue_request',
    'outbound.issue_request_line',
    'outbound.allocation',
    'outbound.pick_task',
    'outbound.pick_task_line',
    'outbound.pick_confirmation',
    'outbound.goods_issue',
    'outbound.goods_issue_line'
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table.replace('.', '\\.')}`));
  }
  assert.doesNotMatch(migration, /stock_status[\s\S]{0,80}'RESERVED'/);
  assert.match(migration, /REFERENCES inventory\.inventory_reservation/);
  assert.match(migration, /CREATE VIEW outbound\.fefo_available_inventory/);
});

test('Phase 6 migration enforces state, whole-case and FEFO override invariants', () => {
  assert.match(migration, /validate_issue_request_transition/);
  assert.match(migration, /requested_quantity bigint NOT NULL CHECK \(requested_quantity > 0\)/);
  assert.match(migration, /picked_quantity <= allocated_quantity/);
  assert.match(migration, /override_used AND override_reason IS NOT NULL/);
  assert.match(migration, /OUTBOUND\.FEFO_OVERRIDE/);
});

test('allocation uses canonical reservation and Goods Issue posts atomically through Inventory Core', () => {
  assert.match(service, /this\.db\.transaction/);
  assert.match(service, /inventory\.reserve_inventory/);
  assert.match(service, /inventory\.fulfill_reservation/);
  assert.match(service, /inventory\.post_movement/);
  assert.match(service, /platform\.outbox_event/);
  assert.match(service, /audit\.audit_event/);
  const fulfill = service.indexOf("'SELECT inventory.fulfill_reservation");
  const post = service.indexOf('SELECT inventory.post_movement', fulfill);
  const documentPosted = service.indexOf("SET status = 'POSTED'", post);
  assert.ok(fulfill > 0 && post > fulfill && documentPosted > post);
});

test('picking verifies current barcode and cancellation releases without movement', () => {
  assert.match(service, /catalog\.barcode/);
  assert.match(service, /PICK_BARCODE_SKU_MISMATCH/);
  const cancelMethod = service.match(/async cancelIssueRequest[\s\S]*?private async lockIssue/)?.[0] ?? '';
  assert.match(cancelMethod, /inventory\.release_reservation/);
  assert.doesNotMatch(cancelMethod, /inventory\.post_movement/);
});

test('controller and OpenAPI expose explicit Phase 6 commands', () => {
  for (const route of [
    "@Post('issue-requests')",
    "@Post('issue-requests/:id/submit')",
    "@Post('issue-requests/:id/approve')",
    "@Post('issue-requests/:id/allocate')",
    "@Post('issue-requests/:id/pick-tasks')",
    "@Post('pick-tasks/:taskId/scan')",
    "@Post('issue-requests/:id/post')",
    "@Post('issue-requests/:id/cancel')"
  ]) {
    assert.ok(controller.includes(route), `Missing controller route ${route}`);
  }
  assert.match(openapi, /WMS Outbound and FEFO API/);
  assert.match(openapi, /Idempotency-Key/);
  assert.match(openapi, /expectedVersion/);
});
