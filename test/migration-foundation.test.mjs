import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../backend/database/migrations/0001_phase2_foundation.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

test('idempotency scope is unique by caller, operation and key', () => {
  assert.match(sql, /UNIQUE \(caller_id, operation, idempotency_key\)/);
});

test('outbox has retry-safe pending index and non-negative attempts', () => {
  assert.match(sql, /attempts integer NOT NULL DEFAULT 0 CHECK \(attempts >= 0\)/);
  assert.match(sql, /WHERE status IN \('PENDING', 'FAILED'\)/);
});

test('audit event is protected by an append-only trigger', () => {
  assert.match(sql, /CREATE TRIGGER trg_audit_event_append_only/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON audit\.audit_event/);
});
