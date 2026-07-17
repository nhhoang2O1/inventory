import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeWarehouseAction } from '../shared/contracts/dist/index.js';

const actor = {
  userId: 'user-1',
  effectiveRoleId: 'warehouse-operator',
  active: true,
  permissions: ['INVENTORY.VIEW', 'RECEIVING.POST'],
  warehouseIds: ['warehouse-a']
};

test('allows only when actor has permission and warehouse scope', () => {
  assert.deepEqual(
    authorizeWarehouseAction(actor, 'RECEIVING.POST', 'warehouse-a'),
    { allowed: true }
  );
});

test('denies an inactive actor before evaluating grants', () => {
  assert.deepEqual(
    authorizeWarehouseAction({ ...actor, active: false }, 'RECEIVING.POST', 'warehouse-a'),
    { allowed: false, code: 'ACTOR_INACTIVE' }
  );
});

test('denies an action outside the effective role permissions', () => {
  assert.deepEqual(
    authorizeWarehouseAction(actor, 'INVENTORY.ADJUST', 'warehouse-a'),
    { allowed: false, code: 'PERMISSION_DENIED' }
  );
});

test('denies an action outside the actor warehouse scope', () => {
  assert.deepEqual(
    authorizeWarehouseAction(actor, 'RECEIVING.POST', 'warehouse-b'),
    { allowed: false, code: 'WAREHOUSE_SCOPE_DENIED' }
  );
});
