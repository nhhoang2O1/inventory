import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../packages/database/migrations/0002_phase3_iam.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

test('a user has exactly one effective role and roles own permissions', () => {
  assert.match(sql, /role_id uuid NOT NULL REFERENCES iam\.role\(id\)/);
  assert.match(sql, /CREATE TABLE iam\.role_permission/);
  assert.doesNotMatch(sql, /CREATE TABLE iam\.user_role/);
});

test('warehouse scope uses real foreign keys and preserves grant history', () => {
  assert.match(sql, /warehouse_id uuid NOT NULL REFERENCES warehouse\.warehouse\(id\)/);
  assert.match(sql, /PRIMARY KEY \(user_id, warehouse_id, valid_from\)/);
  assert.match(sql, /revoked_at timestamptz/);
});

test('IAM master data uses normalized codes and deactivation constraints', () => {
  assert.match(sql, /ck_role_code_normalized/);
  assert.match(sql, /ck_permission_code_normalized/);
  assert.match(sql, /ck_user_deactivation/);
});

test('Phase 3 IAM migration does not create Inventory Core tables', () => {
  assert.doesNotMatch(sql, /CREATE TABLE inventory\./);
});
