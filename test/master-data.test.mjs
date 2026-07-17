import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises'; import test from 'node:test';
const sql=await readFile(new URL('../backend/database/migrations/0004_phase3_master_data.sql',import.meta.url),'utf8');
test('Product 1:N SKU and whole-case UOM are enforced',()=>{assert.match(sql,/product_id uuid NOT NULL REFERENCES catalog\.product/);assert.match(sql,/code IN \('CASE','CRATE','KEG'\)/);});
test('current barcode and packaging are unique and effective-dated',()=>{assert.match(sql,/uq_barcode_current/);assert.match(sql,/uq_packaging_current/);assert.match(sql,/valid_until timestamptz/);});
test('wholesale minimum is positive integer policy',()=>assert.match(sql,/minimum_quantity bigint NOT NULL CHECK \(minimum_quantity > 0\)/));
test('warehouse topology has configurable capacity and mixing',()=>{assert.match(sql,/CREATE TABLE warehouse\.zone/);assert.match(sql,/CREATE TABLE warehouse\.location/);assert.match(sql,/SINGLE_SKU','SINGLE_BATCH','MIXED/);assert.match(sql,/CREATE TABLE warehouse\.capacity_rule/);});
