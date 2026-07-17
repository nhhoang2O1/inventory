import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import test from 'node:test';
const controller=await readFile(new URL('../apps/api/src/modules/inventory/public/inventory.controller.ts',import.meta.url),'utf8');
const service=await readFile(new URL('../apps/api/src/modules/inventory/public/inventory-application.service.ts',import.meta.url),'utf8');
const lifecycle=await readFile(new URL('../packages/database/migrations/0007_phase4_reservation_lifecycle.sql',import.meta.url),'utf8');
test('API exposes ATP reservation release and posting',()=>{for(const route of ["@Get('atp')","@Post('reservations')","@Post('reservations/:id/release')","@Post('postings')"])assert.match(controller,new RegExp(route.replace(/[()']/g,'\\$&')));});
test('multi-line posting uses one database transaction',()=>{assert.match(service,/this\.db\.transaction/);assert.match(service,/for\(const \[index,line\] of lines\.entries\(\)\)/);});
test('issue fulfillment runs with posting client transaction',()=>assert.match(service,/client\.query\('SELECT inventory\.fulfill_reservation/));
test('expiry and fulfillment never create movement',()=>{assert.match(lifecycle,/expire_reservations/);assert.match(lifecycle,/fulfill_reservation/);assert.doesNotMatch(lifecycle,/inventory_movement_ledger/);});
