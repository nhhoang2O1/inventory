import pg from 'pg';

export interface DeliveryMessage {
  deliveryId: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  occurredAt: string;
  payload: unknown;
  headers: Record<string, unknown>;
  endpointCode: string;
  transport: 'HTTP' | 'MOCK';
  endpointUrl: string | null;
  secretReference: string | null;
  attemptNumber: number;
  cycleAttempt: number;
  maxAttempts: number;
  baseBackoffSeconds: number;
}

export interface PublishResult { responseStatus?: number }
export type DeliveryPublisher = (message: DeliveryMessage) => Promise<PublishResult>;

export class DeliveryPublishError extends Error {
  constructor(message: string, readonly responseStatus?: number) { super(message); }
}

export const defaultPublisher: DeliveryPublisher = async (message) => {
  if (message.transport === 'MOCK') return { responseStatus: 200 };
  if (!message.endpointUrl) throw new DeliveryPublishError('HTTP endpoint URL is not configured');
  const secret = message.secretReference ? process.env[message.secretReference] : undefined;
  const response = await fetch(message.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': message.eventId,
      'X-Correlation-Id': message.correlationId,
      'X-Event-Type': message.eventType,
      ...(secret ? { Authorization: `Bearer ${secret}` } : {})
    },
    body: JSON.stringify({
      id: message.eventId,
      type: message.eventType,
      version: message.eventVersion,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      occurredAt: message.occurredAt,
      correlationId: message.correlationId,
      payload: message.payload
    }),
    signal: AbortSignal.timeout(Number(process.env.INTEGRATION_HTTP_TIMEOUT_MS ?? 10_000))
  });
  if (!response.ok) throw new DeliveryPublishError(`Endpoint returned HTTP ${response.status}`, response.status);
  return { responseStatus: response.status };
};

async function recoverStale(pool: pg.Pool): Promise<void> {
  await pool.query(`
    UPDATE integration.outbox_delivery
    SET status='FAILED',available_at=now(),processing_started_at=NULL,
      last_error='Worker lease expired',updated_at=now()
    WHERE status='PROCESSING' AND processing_started_at < now()-interval '5 minutes'`);
  await pool.query(`
    UPDATE platform.outbox_event
    SET status='FAILED',available_at=now(),processing_started_at=NULL,last_error='Worker lease expired'
    WHERE status='PROCESSING' AND processing_started_at < now()-interval '5 minutes'`);
}

async function fanOutEvents(pool: pg.Pool, batchSize: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const events = await client.query<{ id: string; event_type: string }>(`
      SELECT id,event_type FROM platform.outbox_event
      WHERE status IN ('PENDING','FAILED') AND available_at <= now()
      ORDER BY occurred_at,id FOR UPDATE SKIP LOCKED LIMIT $1`, [batchSize]);
    for (const event of events.rows) {
      const subscriptions = await client.query<{ endpoint_id: string }>(`
        SELECT subscription.endpoint_id
        FROM integration.outbox_subscription subscription
        JOIN integration.integration_endpoint endpoint ON endpoint.id=subscription.endpoint_id
        WHERE subscription.event_type=$1 AND subscription.status='ACTIVE' AND endpoint.status='ACTIVE'`,
      [event.event_type]);
      if (subscriptions.rowCount === 0) {
        await client.query(`
          UPDATE platform.outbox_event
          SET status='PUBLISHED',attempts=attempts+1,published_at=now(),processing_started_at=NULL,last_error=NULL
          WHERE id=$1`, [event.id]);
        continue;
      }
      for (const subscription of subscriptions.rows) {
        await client.query(`
          INSERT INTO integration.outbox_delivery (event_id,endpoint_id)
          VALUES ($1,$2) ON CONFLICT (event_id,endpoint_id) DO NOTHING`,
        [event.id, subscription.endpoint_id]);
      }
      await client.query(`
        UPDATE platform.outbox_event
        SET status='PROCESSING',attempts=attempts+1,processing_started_at=now(),last_error=NULL
        WHERE id=$1`, [event.id]);
    }
    await client.query('COMMIT');
    return events.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function claimDeliveries(pool: pg.Pool, batchSize: number): Promise<DeliveryMessage[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query<{
      delivery_id: string; event_id: string; event_type: string; event_version: number;
      aggregate_type: string; aggregate_id: string; correlation_id: string; occurred_at: string; payload: unknown;
      headers: Record<string, unknown>; endpoint_code: string; transport: 'HTTP' | 'MOCK';
      endpoint_url: string | null; secret_reference: string | null; attempts: number;
      cycle_attempts: number; max_attempts: number; base_backoff_seconds: number;
    }>(`
      SELECT delivery.id AS delivery_id,event.id AS event_id,event.event_type,event.event_version,
        event.aggregate_type,event.aggregate_id,event.correlation_id,event.occurred_at,event.payload,event.headers,
        endpoint.code AS endpoint_code,endpoint.transport,endpoint.endpoint_url,endpoint.secret_reference,
        delivery.attempts,delivery.cycle_attempts,endpoint.max_attempts,endpoint.base_backoff_seconds
      FROM integration.outbox_delivery delivery
      JOIN platform.outbox_event event ON event.id=delivery.event_id
      JOIN integration.integration_endpoint endpoint ON endpoint.id=delivery.endpoint_id
      WHERE delivery.status IN ('PENDING','FAILED') AND delivery.available_at <= now()
        AND endpoint.status='ACTIVE'
      ORDER BY delivery.available_at,delivery.created_at,delivery.id
      FOR UPDATE OF delivery SKIP LOCKED LIMIT $1`, [batchSize]);
    const messages: DeliveryMessage[] = [];
    for (const row of rows.rows) {
      const updated = await client.query<{ attempts: number; cycle_attempts: number }>(`
        UPDATE integration.outbox_delivery
        SET status='PROCESSING',attempts=attempts+1,cycle_attempts=cycle_attempts+1,
          processing_started_at=now(),updated_at=now()
        WHERE id=$1 RETURNING attempts,cycle_attempts`, [row.delivery_id]);
      const attempt = updated.rows[0];
      if (!attempt) continue;
      messages.push({
        deliveryId: row.delivery_id, eventId: row.event_id, eventType: row.event_type,
        eventVersion: Number(row.event_version), aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id, correlationId: row.correlation_id, occurredAt: row.occurred_at,
        payload: row.payload, headers: row.headers ?? {}, endpointCode: row.endpoint_code,
        transport: row.transport, endpointUrl: row.endpoint_url, secretReference: row.secret_reference,
        attemptNumber: Number(attempt.attempts), cycleAttempt: Number(attempt.cycle_attempts),
        maxAttempts: Number(row.max_attempts), baseBackoffSeconds: Number(row.base_backoff_seconds)
      });
    }
    await client.query('COMMIT');
    return messages;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateEventAggregate(client: pg.PoolClient, eventId: string, lastError?: string): Promise<void> {
  const aggregate = await client.query<{
    delivery_count: string; published_count: string; dead_count: string; failed_count: string; next_available_at: string | null;
  }>(`
    SELECT count(*)::bigint AS delivery_count,
      count(*) FILTER (WHERE status='PUBLISHED')::bigint AS published_count,
      count(*) FILTER (WHERE status='DEAD_LETTER')::bigint AS dead_count,
      count(*) FILTER (WHERE status='FAILED')::bigint AS failed_count,
      min(available_at) FILTER (WHERE status IN ('PENDING','FAILED')) AS next_available_at
    FROM integration.outbox_delivery WHERE event_id=$1`, [eventId]);
  const state = aggregate.rows[0];
  if (!state) return;
  const deliveryCount = Number(state.delivery_count);
  const publishedCount = Number(state.published_count);
  const deadCount = Number(state.dead_count);
  const failedCount = Number(state.failed_count);
  if (deliveryCount > 0 && publishedCount === deliveryCount) {
    await client.query(`
      UPDATE platform.outbox_event SET status='PUBLISHED',published_at=now(),processing_started_at=NULL,last_error=NULL
      WHERE id=$1`, [eventId]);
  } else if (deadCount > 0) {
    await client.query(`
      UPDATE platform.outbox_event SET status='DEAD_LETTER',processing_started_at=NULL,last_error=$2
      WHERE id=$1`, [eventId, lastError ?? 'One or more deliveries exhausted retry policy']);
  } else if (failedCount > 0) {
    await client.query(`
      UPDATE platform.outbox_event
      SET status='FAILED',available_at=coalesce($2,now()),processing_started_at=NULL,last_error=$3
      WHERE id=$1`, [eventId, state.next_available_at, lastError ?? 'Delivery failed']);
  } else {
    await client.query(`UPDATE platform.outbox_event SET status='PROCESSING',processing_started_at=now() WHERE id=$1`, [eventId]);
  }
}

async function completeSuccess(pool: pg.Pool, message: DeliveryMessage, responseStatus?: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE integration.outbox_delivery
      SET status='PUBLISHED',published_at=now(),processing_started_at=NULL,last_error=NULL,updated_at=now()
      WHERE id=$1 AND status='PROCESSING'`, [message.deliveryId]);
    await client.query(`
      INSERT INTO integration.outbox_delivery_attempt (
        delivery_id,attempt_number,outcome,response_status
      ) VALUES ($1,$2,'PUBLISHED',$3)`, [message.deliveryId, message.attemptNumber, responseStatus ?? null]);
    await updateEventAggregate(client, message.eventId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function completeFailure(pool: pg.Pool, message: DeliveryMessage, error: unknown): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const errorMessage = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
    const responseStatus = error instanceof DeliveryPublishError ? error.responseStatus : undefined;
    const deadLetter = message.cycleAttempt >= message.maxAttempts;
    const exponential = Math.min(message.baseBackoffSeconds * (2 ** Math.max(message.cycleAttempt - 1, 0)), 3600);
    const jitter = Math.floor(Math.random() * Math.max(message.baseBackoffSeconds, 1));
    await client.query(`
      UPDATE integration.outbox_delivery
      SET status=$2,available_at=now()+($3::text || ' seconds')::interval,
        processing_started_at=NULL,last_error=$4,updated_at=now()
      WHERE id=$1 AND status='PROCESSING'`,
    [message.deliveryId, deadLetter ? 'DEAD_LETTER' : 'FAILED', exponential + jitter, errorMessage]);
    await client.query(`
      INSERT INTO integration.outbox_delivery_attempt (
        delivery_id,attempt_number,outcome,response_status,error_message
      ) VALUES ($1,$2,$3,$4,$5)`,
    [message.deliveryId, message.attemptNumber, deadLetter ? 'DEAD_LETTER' : 'FAILED', responseStatus ?? null, errorMessage]);
    await updateEventAggregate(client, message.eventId, errorMessage);
    await client.query('COMMIT');
  } catch (failure) {
    await client.query('ROLLBACK');
    throw failure;
  } finally {
    client.release();
  }
}

export async function processOutboxBatch(
  pool: pg.Pool,
  batchSize: number,
  publisher: DeliveryPublisher = defaultPublisher
): Promise<{ eventsClaimed: number; deliveriesProcessed: number }> {
  await recoverStale(pool);
  const eventsClaimed = await fanOutEvents(pool, batchSize);
  const deliveries = await claimDeliveries(pool, batchSize);
  for (const message of deliveries) {
    try {
      const result = await publisher(message);
      await completeSuccess(pool, message, result.responseStatus);
    } catch (error) {
      await completeFailure(pool, message, error);
    }
  }
  return { eventsClaimed, deliveriesProcessed: deliveries.length };
}
