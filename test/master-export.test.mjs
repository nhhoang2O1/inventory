import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import test from 'node:test';
const sql=await readFile(new URL('../packages/database/migrations/0006_phase3_master_data_export.sql',import.meta.url),'utf8');
test('master export is asynchronous, scoped and private-object based',()=>{assert.match(sql,/master_data_export_job/);assert.match(sql,/warehouse_id uuid REFERENCES warehouse\.warehouse/);assert.match(sql,/object_key text/);assert.match(sql,/PENDING','PROCESSING','COMPLETED','FAILED','EXPIRED/);});
