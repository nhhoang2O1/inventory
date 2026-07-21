import pg from 'pg';

const client = new pg.Client(process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms');

async function checkReleaseGate() {
  console.log('--- Phase 10 Operational Release Gate Check ---');
  await client.connect();

  const res = await client.query('SELECT * FROM platform.release_readiness_snapshot');
  const snapshot = res.rows[0];

  console.log('Observed At:', snapshot.observed_at);
  console.log('Inventory Variance Count:', snapshot.inventory_variance_count);
  console.log('Stale Outbox Count:', snapshot.stale_outbox_count);
  console.log('Outbox Dead Letter Count:', snapshot.outbox_dead_letter_count);
  console.log('Integration Dead Letter Count:', snapshot.integration_dead_letter_count);
  console.log('Stale Idempotency Count:', snapshot.stale_idempotency_count);
  console.log('Active Stocktake Lock Count:', snapshot.active_stocktake_lock_count);

  const isReady =
    Number(snapshot.inventory_variance_count) === 0 &&
    Number(snapshot.stale_outbox_count) === 0 &&
    Number(snapshot.outbox_dead_letter_count) === 0 &&
    Number(snapshot.integration_dead_letter_count) === 0 &&
    Number(snapshot.stale_idempotency_count) === 0;

  if (isReady) {
    console.log('\n✅ OPERATIONAL RELEASE GATE PASSED! System is ready for Phase 10 release.');
  } else {
    console.error('\n❌ OPERATIONAL RELEASE GATE FAILED! System has blocking variances or stale outbox records.');
    process.exit(1);
  }

  await client.end();
}

checkReleaseGate().catch(err => {
  console.error('Release gate error:', err);
  process.exit(1);
});
