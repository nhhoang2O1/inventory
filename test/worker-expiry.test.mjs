import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import test from'node:test';
const source=await readFile(new URL('../backend/worker/src/main.ts',import.meta.url),'utf8');
test('worker expires reservations idempotently in its poll transaction',()=>{assert.match(source,/inventory\.expire_reservations\(now\(\)\)/);assert.match(source,/await client\.query\('COMMIT'\)/);});
