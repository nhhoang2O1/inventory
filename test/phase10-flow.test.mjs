import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../packages/database/migrations/0017_phase10_release_readiness.sql', import.meta.url),
  'utf8'
);
const auth = await readFile(
  new URL('../apps/api/src/modules/iam/public/auth.service.ts', import.meta.url),
  'utf8'
);
const guard = await readFile(
  new URL('../apps/api/src/modules/iam/public/auth-session.guard.ts', import.meta.url),
  'utf8'
);
const release = await readFile(
  new URL('../apps/api/src/modules/release/public/release.service.ts', import.meta.url),
  'utf8'
);
const html = await readFile(new URL('../apps/web/index.html', import.meta.url), 'utf8');
const demoSeed = await readFile(new URL('../scripts/seeds/initial-demo-users.sql', import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../packages/database/migrations/', import.meta.url)))
  .filter((name) => /^\d+.*\.sql$/.test(name));

test('Phase 10 migration provides session security and immutable release evidence', () => {
  for (const object of [
    'iam.auth_login_attempt',
    'iam.auth_session',
    'platform.release_gate_run',
    'platform.release_readiness_snapshot'
  ]) assert.match(migration, new RegExp(object.replace('.', '\\.')));
  assert.match(migration, /trg_auth_login_attempt_append_only/);
  assert.match(migration, /trg_release_gate_run_append_only/);
  assert.match(migration, /RELEASE\.VIEW/);
  assert.match(migration, /RELEASE\.MANAGE/);
});

test('Phase 10 local authentication hashes passwords, hashes session tokens and throttles failures', () => {
  assert.match(auth, /pbkdf2Sync/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /sessionHash\(token\)/);
  assert.match(auth, /TOO_MANY_REQUESTS/);
  assert.match(auth, /LOGIN_FAILED/);
  assert.match(guard, /NODE_ENV==='production'/);
  assert.match(guard, /validateSession/);
});

test('Phase 10 exposes operational blockers and idempotent audited release gates', () => {
  assert.match(release, /expectedMigration='0017_phase10_release_readiness\.sql'/);
  assert.match(release, /IDEMPOTENCY_CONFLICT/);
  assert.match(release, /RELEASE\.MANAGE/);
  assert.match(release, /INSERT INTO audit\.audit_event/);
});

test('Merged UI is production-built and Hưng demo seed is not a migration', () => {
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.match(demoSeed, /Development\/UAT seed only/);
  assert.doesNotMatch(demoSeed, /DELETE FROM iam\.user_warehouse_scope/i);
  assert.doesNotMatch(demoSeed, /123456/);
  const prefixes = migrations.map((name) => name.slice(0, 4));
  assert.equal(new Set(prefixes).size, prefixes.length);
  assert.ok(!migrations.includes('0012_seed_initial_users.sql'));
});
