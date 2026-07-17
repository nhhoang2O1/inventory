import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../packages/database/migrations/0003_phase3_approval_audit.sql', import.meta.url), 'utf8');
test('approval levels and amount thresholds are configurable', () => {
  assert.match(sql, /CREATE TABLE approval\.policy_level/);
  assert.match(sql, /minimum_amount numeric\(19,4\)/);
  assert.match(sql, /required_levels smallint/);
});
test('database trigger enforces four-eyes', () => {
  assert.match(sql, /four-eyes violation: creator cannot approve own request/);
  assert.match(sql, /CREATE TRIGGER trg_approval_event_validate/);
});
test('approval events are append-only', () => {
  assert.match(sql, /CREATE TRIGGER trg_approval_event_append_only/);
  assert.match(sql, /EXECUTE FUNCTION audit\.reject_mutation/);
});
test('audit captures required security and approval context', () => {
  for (const column of ['effective_role_id', 'warehouse_scope', 'ip_address', 'device_id', 'session_id', 'approval_request_id', 'override_used', 'outcome']) assert.match(sql, new RegExp(column));
});
