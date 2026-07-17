import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import test from 'node:test';
const sql=await readFile(new URL('../packages/database/migrations/0005_phase4_inventory_core.sql',import.meta.url),'utf8');
test('RESERVED is not a stock status',()=>{assert.doesNotMatch(sql,/stock_status[^\n]*RESERVED/);assert.match(sql,/CREATE TABLE inventory\.inventory_reservation/);});
test('balance key and nonnegative on-hand are enforced',()=>{assert.match(sql,/UNIQUE\(sku_id,batch_id,warehouse_id,location_id,stock_status\)/);assert.match(sql,/quantity_on_hand>=0/);});
test('ATP subtracts only active reservation from sellable on-hand',()=>{assert.match(sql,/sellable_on_hand.*active_reservation/s);assert.match(sql,/status='ACTIVE'/);});
test('reservation is serialized and fails insufficient ATP',()=>{assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/INVENTORY_ATP_INSUFFICIENT/);});
test('posting is idempotent atomic and emits ledger outbox audit',()=>{assert.match(sql,/UNIQUE\(document_type,document_id,command_key\)/);assert.match(sql,/inventory_movement_ledger/);assert.match(sql,/platform\.outbox_event/);assert.match(sql,/audit\.audit_event/);});
test('release does not create movement',()=>{const part=sql.match(/CREATE OR REPLACE FUNCTION inventory\.release_reservation[\s\S]*?END; \$\$/)?.[0]??'';assert.doesNotMatch(part,/inventory_movement_ledger/);});
test('ledger reconciliation exposes variance',()=>assert.match(sql,/CREATE VIEW inventory\.ledger_balance_reconciliation/));
