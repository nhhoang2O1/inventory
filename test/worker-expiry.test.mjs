import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../apps/worker/src/main.ts', import.meta.url), 'utf8');

test('worker processes the reliable outbox and expires reservations idempotently', () => {
  assert.match(source, /processOutboxBatch\(pool, batchSize\)/);
  assert.match(source, /pool\.query<\{ expired_count: number \}>\('SELECT inventory\.expire_reservations\(now\(\)\)/);
});
