import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationDatabaseService } from './integration-database.service.js';

export type IntegrationSystemType = 'POS' | 'ERP' | 'ACCOUNTING' | 'ECOMMERCE' | 'NOTIFICATION' | 'TEST';
export type IntegrationTransport = 'HTTP' | 'MOCK';

export interface CreateIntegrationEndpointInput {
  code: string;
  systemType: IntegrationSystemType;
  transport?: IntegrationTransport;
  endpointUrl?: string;
  secretReference?: string;
  maxAttempts?: number;
  baseBackoffSeconds?: number;
  eventTypes: string[];
}

interface EndpointRow {
  id: string; code: string; system_type: IntegrationSystemType; transport: IntegrationTransport;
  endpoint_url: string | null; secret_reference: string | null; status: string;
  max_attempts: number; base_backoff_seconds: number; request_hash: string; created_at: string;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new ConflictException(`${name} must be a positive integer`);
  return normalized;
}

@Injectable()
export class IntegrationService {
  constructor(private readonly db: IntegrationDatabaseService) {}

  private async requirePermission(actorId: string, permission: string): Promise<void> {
    if (!await this.db.hasPermission(actorId, permission)) throw new ForbiddenException(`${permission} is required`);
  }

  async createEndpoint(
    actorId: string,
    input: CreateIntegrationEndpointInput,
    idempotencyKey: string,
    correlationId: string
  ) {
    const code = input.code.trim().toUpperCase();
    const transport = input.transport ?? 'HTTP';
    const eventTypes = [...new Set(input.eventTypes.map((item) => item.trim().toUpperCase()).filter(Boolean))].sort();
    const normalized = {
      code, systemType: input.systemType, transport,
      endpointUrl: input.endpointUrl?.trim() || null,
      secretReference: input.secretReference?.trim() || null,
      maxAttempts: positiveInteger(input.maxAttempts, 5, 'maxAttempts'),
      baseBackoffSeconds: positiveInteger(input.baseBackoffSeconds, 5, 'baseBackoffSeconds'),
      eventTypes
    };
    if (!code) throw new ConflictException('code is required');
    if (eventTypes.length === 0) throw new ConflictException('At least one event type is required');
    if (transport === 'HTTP' && !normalized.endpointUrl) throw new ConflictException('endpointUrl is required for HTTP transport');
    if (transport === 'HTTP') {
      try {
        const endpoint = new URL(normalized.endpointUrl ?? '');
        if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('unsupported protocol');
      } catch {
        throw new ConflictException('endpointUrl must be a valid HTTP or HTTPS URL');
      }
    }
    const requestHash = stableHash(normalized);
    return this.db.transaction(async (client) => {
      if (!await this.db.hasPermission(actorId, 'INTEGRATION.CONFIGURE', client)) {
        throw new ForbiddenException('INTEGRATION.CONFIGURE is required');
      }
      const replay = await client.query<EndpointRow>(`
        SELECT * FROM integration.integration_endpoint WHERE created_by=$1 AND idempotency_key=$2`,
      [actorId, idempotencyKey]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return this.endpointResponse(client, replay.rows[0], true);
      }
      const inserted = await client.query<EndpointRow>(`
        INSERT INTO integration.integration_endpoint (
          code,system_type,transport,endpoint_url,secret_reference,max_attempts,base_backoff_seconds,
          created_by,idempotency_key,request_hash,correlation_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [code, normalized.systemType, transport, normalized.endpointUrl, normalized.secretReference,
        normalized.maxAttempts, normalized.baseBackoffSeconds, actorId, idempotencyKey, requestHash, correlationId]);
      const endpoint = inserted.rows[0];
      if (!endpoint) throw new Error('Failed to create integration endpoint');
      for (const eventType of eventTypes) {
        await client.query(`
          INSERT INTO integration.outbox_subscription (endpoint_id,event_type) VALUES ($1,$2)`,
        [endpoint.id, eventType]);
      }
      await client.query(`
        INSERT INTO audit.audit_event (
          actor_id,action,resource_type,resource_id,correlation_id,after_data
        ) VALUES ($1,'CREATE','INTEGRATION_ENDPOINT',$2,$3,$4::jsonb)`,
      [actorId, endpoint.id, correlationId, JSON.stringify({ ...normalized, secretReference: normalized.secretReference ? '[CONFIGURED]' : null })]);
      return this.endpointResponse(client, endpoint, false);
    });
  }

  async listEndpoints(actorId: string) {
    await this.requirePermission(actorId, 'INTEGRATION.VIEW');
    const endpoints = await this.db.query<EndpointRow>('SELECT * FROM integration.integration_endpoint ORDER BY code');
    const result = [];
    for (const endpoint of endpoints) {
      const subscriptions = await this.db.query<{ event_type: string; status: string }>(
        'SELECT event_type,status FROM integration.outbox_subscription WHERE endpoint_id=$1 ORDER BY event_type', [endpoint.id]
      );
      result.push({ ...this.endpointBase(endpoint), subscriptions });
    }
    return result;
  }

  async reconciliation(actorId: string) {
    await this.requirePermission(actorId, 'INTEGRATION.VIEW');
    const [eventRows, deliveryRows, staleRows] = await Promise.all([
      this.db.query<{ status: string; count: string }>(`
        SELECT status,count(*)::bigint AS count FROM platform.outbox_event GROUP BY status ORDER BY status`),
      this.db.query<{ status: string; count: string; max_attempts: string }>(`
        SELECT delivery.status,count(*)::bigint AS count,coalesce(max(delivery.attempts),0)::bigint AS max_attempts
        FROM integration.outbox_delivery delivery GROUP BY delivery.status ORDER BY delivery.status`),
      this.db.query<{ stale_events: string; stale_deliveries: string }>(`
        SELECT
          (SELECT count(*)::bigint FROM platform.outbox_event
           WHERE status='PROCESSING' AND processing_started_at < now()-interval '5 minutes') AS stale_events,
          (SELECT count(*)::bigint FROM integration.outbox_delivery
           WHERE status='PROCESSING' AND processing_started_at < now()-interval '5 minutes') AS stale_deliveries`)
    ]);
    return {
      generatedAt: new Date().toISOString(),
      outbox: Object.fromEntries(eventRows.map((row) => [row.status, Number(row.count)])),
      deliveries: Object.fromEntries(deliveryRows.map((row) => [row.status, {
        count: Number(row.count), maximumAttemptsObserved: Number(row.max_attempts)
      }])),
      staleProcessing: {
        events: Number(staleRows[0]?.stale_events ?? 0), deliveries: Number(staleRows[0]?.stale_deliveries ?? 0)
      }
    };
  }

  async listDeadLetters(actorId: string, limitInput = 100) {
    await this.requirePermission(actorId, 'INTEGRATION.VIEW');
    const limit = Math.min(Math.max(Number.isSafeInteger(limitInput) ? limitInput : 100, 1), 200);
    const rows = await this.db.query<{
      event_id: string; event_type: string; correlation_id: string; delivery_id: string;
      endpoint_id: string; endpoint_code: string; attempts: number; cycle_attempts: number;
      last_error: string | null; updated_at: string;
    }>(`
      SELECT event.id AS event_id,event.event_type,event.correlation_id,delivery.id AS delivery_id,
        endpoint.id AS endpoint_id,endpoint.code AS endpoint_code,delivery.attempts,delivery.cycle_attempts,
        delivery.last_error,delivery.updated_at
      FROM integration.outbox_delivery delivery
      JOIN platform.outbox_event event ON event.id=delivery.event_id
      JOIN integration.integration_endpoint endpoint ON endpoint.id=delivery.endpoint_id
      WHERE delivery.status='DEAD_LETTER' ORDER BY delivery.updated_at DESC LIMIT $1`, [limit]);
    return rows.map((row) => ({
      eventId: row.event_id, eventType: row.event_type, correlationId: row.correlation_id,
      deliveryId: row.delivery_id, endpointId: row.endpoint_id, endpointCode: row.endpoint_code,
      attempts: Number(row.attempts), cycleAttempts: Number(row.cycle_attempts),
      lastError: row.last_error, updatedAt: row.updated_at
    }));
  }

  async getEvent(actorId: string, eventId: string) {
    await this.requirePermission(actorId, 'INTEGRATION.VIEW');
    const events = await this.db.query<{
      id: string; aggregate_type: string; aggregate_id: string; event_type: string; event_version: number;
      payload: unknown; headers: unknown; correlation_id: string; status: string; attempts: number;
      occurred_at: string; available_at: string; published_at: string | null; last_error: string | null;
    }>('SELECT * FROM platform.outbox_event WHERE id=$1', [eventId]);
    const event = events[0];
    if (!event) throw new NotFoundException('Outbox event not found');
    const deliveries = await this.db.query<{
      id: string; endpoint_id: string; endpoint_code: string; status: string; attempts: number;
      cycle_attempts: number; available_at: string; published_at: string | null; last_error: string | null;
    }>(`
      SELECT delivery.id,delivery.endpoint_id,endpoint.code AS endpoint_code,delivery.status,
        delivery.attempts,delivery.cycle_attempts,delivery.available_at,delivery.published_at,delivery.last_error
      FROM integration.outbox_delivery delivery
      JOIN integration.integration_endpoint endpoint ON endpoint.id=delivery.endpoint_id
      WHERE delivery.event_id=$1 ORDER BY endpoint.code`, [eventId]);
    const attempts = await this.db.query<{
      delivery_id: string; attempt_number: number; outcome: string; response_status: number | null;
      error_message: string | null; occurred_at: string;
    }>(`
      SELECT attempt.delivery_id,attempt.attempt_number,attempt.outcome,attempt.response_status,
        attempt.error_message,attempt.occurred_at
      FROM integration.outbox_delivery_attempt attempt
      JOIN integration.outbox_delivery delivery ON delivery.id=attempt.delivery_id
      WHERE delivery.event_id=$1 ORDER BY attempt.occurred_at`, [eventId]);
    const replays = await this.db.query<{
      id: string; requested_by: string; reason: string; correlation_id: string; requested_at: string;
    }>('SELECT id,requested_by,reason,correlation_id,requested_at FROM integration.outbox_replay WHERE event_id=$1 ORDER BY requested_at', [eventId]);
    return {
      id: event.id, aggregateType: event.aggregate_type, aggregateId: event.aggregate_id,
      eventType: event.event_type, eventVersion: Number(event.event_version), payload: event.payload,
      headers: event.headers, correlationId: event.correlation_id, status: event.status,
      attempts: Number(event.attempts), occurredAt: event.occurred_at, availableAt: event.available_at,
      publishedAt: event.published_at, lastError: event.last_error,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id, endpointId: delivery.endpoint_id, endpointCode: delivery.endpoint_code,
        status: delivery.status, attempts: Number(delivery.attempts), cycleAttempts: Number(delivery.cycle_attempts),
        availableAt: delivery.available_at, publishedAt: delivery.published_at, lastError: delivery.last_error,
        history: attempts.filter((attempt) => attempt.delivery_id === delivery.id).map((attempt) => ({
          attemptNumber: Number(attempt.attempt_number), outcome: attempt.outcome,
          responseStatus: attempt.response_status, errorMessage: attempt.error_message, occurredAt: attempt.occurred_at
        }))
      })),
      replays: replays.map((replay) => ({
        id: replay.id, requestedBy: replay.requested_by, reason: replay.reason,
        correlationId: replay.correlation_id, requestedAt: replay.requested_at
      }))
    };
  }

  async replay(actorId: string, eventId: string, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('A replay reason is required');
    return this.db.transaction(async (client) => {
      if (!await this.db.hasPermission(actorId, 'INTEGRATION.REPLAY', client)) {
        throw new ForbiddenException('INTEGRATION.REPLAY is required');
      }
      const eventResult = await client.query<{ id: string; status: string }>(
        'SELECT id,status FROM platform.outbox_event WHERE id=$1 FOR UPDATE', [eventId]
      );
      const event = eventResult.rows[0];
      if (!event) throw new NotFoundException('Outbox event not found');
      const dead = await client.query<{ id: string }>(`
        SELECT id FROM integration.outbox_delivery
        WHERE event_id=$1 AND status='DEAD_LETTER' FOR UPDATE`, [eventId]);
      if (event.status !== 'DEAD_LETTER' && dead.rowCount === 0) {
        throw new ConflictException('Only a dead-letter event can be replayed');
      }
      await client.query(`
        UPDATE integration.outbox_delivery
        SET status='PENDING',cycle_attempts=0,available_at=now(),processing_started_at=NULL,
          published_at=NULL,last_error=NULL,updated_at=now()
        WHERE event_id=$1 AND status='DEAD_LETTER'`, [eventId]);
      await client.query(`
        UPDATE platform.outbox_event
        SET status='PENDING',available_at=now(),processing_started_at=NULL,published_at=NULL,last_error=NULL
        WHERE id=$1`, [eventId]);
      const replay = await client.query<{ id: string }>(`
        INSERT INTO integration.outbox_replay (event_id,requested_by,reason,correlation_id)
        VALUES ($1,$2,$3,$4) RETURNING id`, [eventId, actorId, reason.trim(), correlationId]);
      await client.query(`
        INSERT INTO audit.audit_event (
          actor_id,action,resource_type,resource_id,correlation_id,reason,before_data,after_data
        ) VALUES ($1,'REPLAY','OUTBOX_EVENT',$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [actorId, eventId, correlationId, reason.trim(), JSON.stringify({ status: event.status }), JSON.stringify({ status: 'PENDING' })]);
      return { eventId, replayId: replay.rows[0]?.id, status: 'PENDING' };
    });
  }

  private async endpointResponse(client: import('pg').PoolClient, endpoint: EndpointRow, replayed: boolean) {
    const subscriptions = await client.query<{ event_type: string; status: string }>(
      'SELECT event_type,status FROM integration.outbox_subscription WHERE endpoint_id=$1 ORDER BY event_type', [endpoint.id]
    );
    return { ...this.endpointBase(endpoint), subscriptions: subscriptions.rows, replayed };
  }

  private endpointBase(endpoint: EndpointRow) {
    return {
      id: endpoint.id, code: endpoint.code, systemType: endpoint.system_type, transport: endpoint.transport,
      endpointUrl: endpoint.endpoint_url, secretConfigured: endpoint.secret_reference !== null,
      status: endpoint.status, maxAttempts: Number(endpoint.max_attempts),
      baseBackoffSeconds: Number(endpoint.base_backoff_seconds), createdAt: endpoint.created_at
    };
  }
}
