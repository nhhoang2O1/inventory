import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { AuthService } from '../apps/api/dist/modules/iam/public/auth.service.js';
import { IamDatabaseService } from '../apps/api/dist/modules/iam/public/iam-database.service.js';
import { ReleaseDatabaseService } from '../apps/api/dist/modules/release/public/release-database.service.js';
import { ReleaseService } from '../apps/api/dist/modules/release/public/release.service.js';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL
  || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

test('Integration: Phase 10 session, security audit and immutable release gates', async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const iamDb = new IamDatabaseService();
  const releaseDb = new ReleaseDatabaseService();
  const auth = new AuthService(iamDb);
  const release = new ReleaseService(releaseDb);
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`.toLowerCase();
  const username = `p10_${suffix}`;
  const password = 'Phase10Secure2026!';

  try {
    const role = (await client.query(
      `INSERT INTO iam.role(code,name,is_system,status) VALUES($1,$2,true,'ACTIVE') RETURNING id`,
      [`P10_${suffix.toUpperCase()}`, 'Phase 10 release role']
    )).rows[0];
    const actor = (await client.query(
      `INSERT INTO iam.app_user(username,display_name,role_id,auth_provider,password_hash,status)
       VALUES($1,$2,$3,'LOCAL',$4,'ACTIVE') RETURNING id`,
      [username, 'Phase 10 release actor', role.id, auth.hashPassword(password)]
    )).rows[0];
    await client.query(
      `INSERT INTO iam.role_permission(role_id,permission_id,granted_by)
       SELECT $1,id,$2 FROM iam.permission WHERE code IN('RELEASE.VIEW','RELEASE.MANAGE')`,
      [role.id, actor.id]
    );

    await assert.rejects(() => auth.login(username, 'WrongPassword2026!', randomUUID()));
    const failure = await client.query(
      `SELECT count(*)::int count FROM iam.auth_login_attempt
       WHERE username=$1 AND outcome='FAILED'`,
      [username]
    );
    assert.equal(failure.rows[0].count, 1);
    const failedAudit = await client.query(
      `SELECT count(*)::int count FROM audit.audit_event
       WHERE resource_type='AUTHENTICATION' AND resource_id=$1 AND action='LOGIN_FAILED'`,
      [actor.id]
    );
    assert.equal(failedAudit.rows[0].count, 1);

    const login = await auth.login(username, password, randomUUID());
    assert.equal(login.userId, actor.id);
    assert.ok(login.sessionToken.length >= 32);
    assert.deepEqual(await auth.validateSession(login.sessionToken), { user_id: actor.id });
    const stored = await client.query(
      'SELECT token_hash FROM iam.auth_session WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
      [actor.id]
    );
    assert.equal(stored.rows[0].token_hash.length, 64);
    assert.notEqual(stored.rows[0].token_hash, login.sessionToken);

    const readiness = await release.readiness(actor.id);
    assert.equal(readiness.migration, '0017_phase10_release_readiness.sql');
    const input = {
      releaseVersion: `rc-${suffix}`,
      environment: 'TEST',
      gateType: 'REGRESSION',
      status: 'PASSED',
      evidence: { tests: 1, failures: 0 }
    };
    const idempotencyKey = `phase10-regression-${suffix}`;
    const correlationId = randomUUID();
    const recorded = await release.recordGate(actor.id, input, idempotencyKey, correlationId);
    assert.equal(recorded.replayed, false);
    const replay = await release.recordGate(actor.id, input, idempotencyKey, correlationId);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      () => release.recordGate(actor.id, { ...input, status: 'FAILED' }, idempotencyKey, correlationId),
      /IDEMPOTENCY_CONFLICT/
    );
    const gates = await release.listGates(actor.id, input.releaseVersion);
    assert.equal(gates.length, 1);
    await assert.rejects(
      () => client.query('UPDATE platform.release_gate_run SET status=$1 WHERE id=$2', ['FAILED', recorded.id]),
      /append-only/
    );

    await auth.logout(login.sessionToken, actor.id, randomUUID());
    assert.equal(await auth.validateSession(login.sessionToken), null);
  } finally {
    await client.end();
    await Promise.all([iamDb.onModuleDestroy(), releaseDb.onModuleDestroy()]);
  }
});
