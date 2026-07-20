import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const migration=await readFile(new URL('../packages/database/migrations/0016_phase5_completion.sql',import.meta.url),'utf8');
const po=await readFile(new URL('../apps/api/src/modules/purchasing/public/purchase-order.service.ts',import.meta.url),'utf8');
const receipt=await readFile(new URL('../apps/api/src/modules/receiving/public/goods-receipt.service.ts',import.meta.url),'utf8');
test('Phase 5 completion adds PR, calendar, delivery schedule and exception records',()=>{
  assert.match(migration,/CREATE TABLE purchasing\.purchase_request/);assert.match(migration,/CREATE TABLE purchasing\.business_calendar/);
  assert.match(migration,/CREATE TABLE purchasing\.purchase_order_delivery_schedule/);assert.match(migration,/CREATE TABLE receiving\.receipt_exception_request/);
});
test('Phase 5 completion enforces four-eyes and explicit state machines in database',()=>{
  assert.match(migration,/PURCHASE_REQUEST_FOUR_EYES_VIOLATION/);assert.match(migration,/PURCHASE_ORDER_FOUR_EYES_VIOLATION/);
  assert.match(migration,/RECEIPT_EXCEPTION_FOUR_EYES_VIOLATION/);assert.match(migration,/DRAFT.*PENDING_APPROVAL/s);assert.match(migration,/DRAFT.*RECEIVING/s);
});
test('Inbound application uses scoped permissions, canonical idempotency and Inventory Core',()=>{
  assert.match(po,/PURCHASING\.PO_APPROVE/);assert.match(po,/PURCHASING\.PO_SEND/);assert.match(receipt,/platform\.idempotency_record/);
  assert.match(receipt,/inventory\.post_movement/);assert.doesNotMatch(receipt,/INSERT INTO inventory\.inventory_balance/);
  assert.match(receipt,/ALLOW_WITH_APPROVAL/);assert.match(receipt,/consumeException/);assert.match(receipt,/allocateSchedules/);
});
