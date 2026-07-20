import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const expectedMigration = '0017_phase10_release_readiness.sql';
const connectionString = process.env.DATABASE_URL;
const releaseVersion = process.env.RELEASE_VERSION?.trim();
const releaseEnvironment = (process.env.RELEASE_ENVIRONMENT || 'STAGING').trim().toUpperCase();

if (!connectionString) throw new Error('DATABASE_URL is required');
if (!['TEST', 'STAGING', 'PRODUCTION'].includes(releaseEnvironment)) {
  throw new Error('RELEASE_ENVIRONMENT must be TEST, STAGING or PRODUCTION');
}

const client = new Client({ connectionString });
await client.connect();

try {
  const migration = await client.query(
    'SELECT version FROM platform.schema_migration ORDER BY version DESC LIMIT 1'
  );
  const snapshot = await client.query('SELECT * FROM platform.release_readiness_snapshot');
  const row = snapshot.rows[0];
  if (!row) throw new Error('Release readiness snapshot is unavailable');

  const checks = {
    inventoryVariance: Number(row.inventory_variance_count),
    staleOutbox: Number(row.stale_outbox_count),
    outboxDeadLetters: Number(row.outbox_dead_letter_count),
    integrationDeadLetters: Number(row.integration_dead_letter_count),
    staleIdempotency: Number(row.stale_idempotency_count),
    activeStocktakeLocks: Number(row.active_stocktake_lock_count)
  };
  const blockers = [];
  if (migration.rows[0]?.version !== expectedMigration) {
    blockers.push(`migration head is ${migration.rows[0]?.version || 'missing'}, expected ${expectedMigration}`);
  }
  for (const [name, value] of Object.entries(checks)) {
    if (!Number.isFinite(value) || value !== 0) blockers.push(`${name}=${value}`);
  }

  let gateSummary = null;
  if (releaseVersion) {
    const result = await client.query(
      `SELECT gate_type,status,executed_at
       FROM platform.release_gate_run
       WHERE release_version=$1 AND environment=$2
       ORDER BY executed_at DESC`,
      [releaseVersion, releaseEnvironment]
    );
    const required = [
      'REGRESSION', 'PERFORMANCE', 'SECURITY', 'BACKUP_RESTORE',
      'UAT', 'RECONCILIATION', 'SMOKE', 'GO_NO_GO'
    ];
    for (const gateType of required) {
      const latest = result.rows.find((gate) => gate.gate_type === gateType);
      if (!latest || latest.status !== 'PASSED') {
        blockers.push(`${gateType} latest status is ${latest?.status || 'MISSING'}`);
      }
    }
    const migrationGates = result.rows.filter((gate) => gate.gate_type === 'MIGRATION_DRY_RUN');
    if (migrationGates[0] && migrationGates[0].status !== 'PASSED') {
      blockers.push(`MIGRATION_DRY_RUN latest status is ${migrationGates[0].status}`);
    }
    const migrationRuns = migrationGates.filter(
      (gate) => gate.gate_type === 'MIGRATION_DRY_RUN' && gate.status === 'PASSED'
    );
    if (migrationRuns.length < 2) blockers.push(`MIGRATION_DRY_RUN passed ${migrationRuns.length}/2`);
    gateSummary = { releaseVersion, environment: releaseEnvironment, recorded: result.rows.length };
  }

  const report = {
    status: blockers.length === 0 ? 'PASSED' : 'BLOCKED',
    expectedMigration,
    actualMigration: migration.rows[0]?.version || null,
    checks,
    gateSummary,
    blockers
  };
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
} finally {
  await client.end();
}
