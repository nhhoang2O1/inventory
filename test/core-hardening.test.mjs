import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import test from'node:test';
const sql=await readFile(new URL('../backend/database/migrations/0009_phase4_core_gate_hardening.sql',import.meta.url),'utf8');
test('fulfillment is bound to reservation SKU and warehouse',()=>{assert.match(sql,/reservation allocation scope mismatch/);assert.match(sql,/v\.sku_id<>p_sku_id OR v\.warehouse_id<>p_warehouse_id/);});
test('balance mutation cannot leave ATP negative',()=>{assert.match(sql,/CREATE CONSTRAINT TRIGGER trg_inventory_balance_nonnegative_atp/);assert.match(sql,/INVENTORY_ATP_NEGATIVE/);});
test('IN_TRANSIT has a canonical query view',()=>assert.match(sql,/CREATE VIEW inventory\.in_transit_summary/));
