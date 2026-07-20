import pg from 'pg';
import { processOutboxBatch } from './outbox-processor.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);

async function poll(): Promise<void> {
  try {
    const outbox = await processOutboxBatch(pool, batchSize);
    const expiry = await pool.query<{ expired_count: number }>('SELECT inventory.expire_reservations(now()) AS expired_count');
    const expiredCount = expiry.rows[0]?.expired_count ?? 0;
    if (expiredCount > 0) console.log(JSON.stringify({ level: 'info', message: 'reservations_expired', count: expiredCount }));
    if (outbox.deliveriesProcessed > 0) {
      console.log(JSON.stringify({ level: 'info', message: 'outbox_batch_processed', ...outbox }));
    }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'worker_poll_failed', error: String(error) }));
  }
}

const timer = setInterval(() => void poll(), intervalMs);
timer.unref();
void poll();
async function shutdown(): Promise<void> { clearInterval(timer); await pool.end(); }
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
