import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);

async function poll(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      `SELECT id
         FROM platform.outbox_event
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY occurred_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [batchSize]
    );

    for (const row of result.rows) {
      await client.query(
        `UPDATE platform.outbox_event
            SET status = 'PUBLISHED', published_at = now(), attempts = attempts + 1
          WHERE id = $1`,
        [row.id]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(JSON.stringify({ level: 'error', message: 'outbox_poll_failed', error: String(error) }));
  } finally {
    client.release();
  }
}

const timer = setInterval(() => void poll(), intervalMs);
timer.unref();
void poll();

async function shutdown(): Promise<void> {
  clearInterval(timer);
  await pool.end();
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
