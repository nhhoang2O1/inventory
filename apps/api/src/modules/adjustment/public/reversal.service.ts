import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AdjustmentDatabaseService } from './adjustment-database.service.js';

export interface CreateReversalInput {
  reversalCode: string;
  originalDocumentType: string;
  originalDocumentId: string;
  movementIds: readonly string[];
  reason: string;
}

interface ReversalRow {
  id: string;
  reversal_code: string;
  original_document_type: string;
  original_document_id: string;
  status: string;
  reason: string;
  requested_by: string;
  approved_by: string | null;
  posted_by: string | null;
  idempotency_key: string;
  request_hash: string;
  post_idempotency_key: string | null;
  post_request_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface MovementRow {
  id: string;
  movement_type: string;
  document_type: string;
  document_id: string;
  sku_id: string;
  batch_id: string;
  quantity: string;
  source_warehouse_id: string | null;
  source_location_id: string | null;
  source_status: string | null;
  destination_warehouse_id: string | null;
  destination_location_id: string | null;
  destination_status: string | null;
  reversal_of: string | null;
  occurred_at: string;
}

function commandHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalize(value: string, name: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException(`${name} is required`);
  return normalized;
}

@Injectable()
export class ReversalService {
  constructor(private readonly db: AdjustmentDatabaseService) {}

  async createRequest(actorId: string, input: CreateReversalInput, idempotencyKey: string, correlationId: string) {
    this.validateKey(idempotencyKey);
    const reversalCode = normalize(input.reversalCode, 'Reversal code');
    const originalDocumentType = normalize(input.originalDocumentType, 'Original document type');
    const reason = input.reason.trim();
    if (!reason) throw new ConflictException('Reversal reason is required');
    const movementIds = [...new Set(input.movementIds)];
    if (movementIds.length === 0 || movementIds.length !== input.movementIds.length) {
      throw new ConflictException('movementIds must contain at least one unique movement');
    }
    const hash = commandHash({
      reversalCode, originalDocumentType, originalDocumentId: input.originalDocumentId, movementIds: [...movementIds].sort(), reason
    });

    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, request_hash, status, version FROM adjustment.reversal_request
           WHERE requested_by = $1 AND idempotency_key = $2 FOR UPDATE`, [actorId, idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
        }

        const movements = await client.query<MovementRow>(
          `SELECT id, movement_type, document_type, document_id, sku_id, batch_id, quantity,
                  source_warehouse_id, source_location_id, source_status,
                  destination_warehouse_id, destination_location_id, destination_status,
                  reversal_of, occurred_at
           FROM inventory.inventory_movement_ledger
           WHERE id = ANY($1::uuid[]) ORDER BY occurred_at DESC, id DESC FOR UPDATE`, [movementIds]
        );
        if (movements.rows.length !== movementIds.length) throw new NotFoundException('One or more original movements were not found');
        const documentMovementCount = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM inventory.inventory_movement_ledger
           WHERE document_type = $1 AND document_id = $2 AND reversal_of IS NULL`,
          [originalDocumentType, input.originalDocumentId]
        );
        if (Number(documentMovementCount.rows[0]?.count ?? 0) !== movementIds.length) {
          throw new ConflictException('A reversal request must include every movement of the original document');
        }
        for (const movement of movements.rows) {
          if (movement.document_type !== originalDocumentType || movement.document_id !== input.originalDocumentId) {
            throw new ConflictException('Every movement must belong to the declared original document');
          }
          if (movement.movement_type === 'REVERSAL' || movement.reversal_of) {
            throw new ConflictException('A reversal movement cannot itself be reversed by this workflow');
          }
          await this.authorizeMovement(actorId, movement, client);
        }

        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO adjustment.reversal_request (
             reversal_code, original_document_type, original_document_id, reason,
             requested_by, idempotency_key, request_hash, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, version`,
          [reversalCode, originalDocumentType, input.originalDocumentId, reason, actorId, idempotencyKey, hash, correlationId]
        );
        const request = inserted.rows[0];
        if (!request) throw new Error('Reversal request insert did not return a row');
        for (const movement of movements.rows) {
          await client.query(
            `INSERT INTO adjustment.reversal_line (reversal_request_id, original_movement_id)
             VALUES ($1,$2)`, [request.id, movement.id]
          );
        }
        await this.audit(client, actorId, 'CREATE', 'REVERSAL_REQUEST', request.id,
          this.auditWarehouse(movements.rows[0]), correlationId, reason);
        return { id: request.id, reversalCode, status: 'DRAFT', version: request.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async findRequest(actorId: string, id: string) {
    const requests = await this.db.query<ReversalRow>(
      `SELECT id, reversal_code, original_document_type, original_document_id, status, reason,
              requested_by, approved_by, posted_by, idempotency_key, request_hash,
              post_idempotency_key, post_request_hash, version, created_at, updated_at
       FROM adjustment.reversal_request WHERE id = $1`, [id]
    );
    const request = requests[0];
    if (!request) throw new NotFoundException('Reversal request not found');
    const lines = await this.db.query<MovementRow & { reversal_movement_id: string | null }>(
      `SELECT movement.id, movement.movement_type, movement.document_type, movement.document_id,
              movement.sku_id, movement.batch_id, movement.quantity, movement.source_warehouse_id,
              movement.source_location_id, movement.source_status, movement.destination_warehouse_id,
              movement.destination_location_id, movement.destination_status, movement.reversal_of,
              movement.occurred_at, line.reversal_movement_id
       FROM adjustment.reversal_line line
       JOIN inventory.inventory_movement_ledger movement ON movement.id = line.original_movement_id
       WHERE line.reversal_request_id = $1 ORDER BY movement.occurred_at DESC, movement.id DESC`, [id]
    );
    for (const movement of lines) await this.authorizeMovement(actorId, movement);
    return { ...request, lines: lines.map((line) => ({ ...line, quantity: Number(line.quantity) })) };
  }

  async submitRequest(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.changeState(actorId, id, expectedVersion, 'DRAFT', 'SUBMITTED', 'SUBMIT', correlationId, false);
  }

  async approveRequest(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const request = await this.lockRequest(client, id);
      const movements = await this.lockMovements(client, id);
      for (const movement of movements) await this.authorizeMovement(actorId, movement, client);
      if (request.status === 'APPROVED') {
        return { id, status: request.status, version: request.version, replayed: true };
      }
      this.assertStateVersion(request, 'SUBMITTED', expectedVersion);
      if (request.requested_by === actorId) throw new ConflictException('Requester cannot approve the same reversal');
      const updated = await client.query<{ version: number }>(
        `UPDATE adjustment.reversal_request
         SET status = 'APPROVED', approved_by = $2, approved_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await this.audit(client, actorId, 'APPROVE', 'REVERSAL_REQUEST', id,
        this.auditWarehouse(movements[0]), correlationId, request.reason);
      return { id, status: 'APPROVED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async postRequest(
    actorId: string,
    id: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const hash = commandHash({ id, expectedVersion });
    try {
      return await this.db.transaction(async (client) => {
        const request = await this.lockRequest(client, id);
        const movements = await this.lockMovements(client, id);
        for (const movement of movements) await this.authorizeMovement(actorId, movement, client);
        if (request.post_idempotency_key) {
          if (request.post_idempotency_key !== idempotencyKey || request.post_request_hash !== hash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const posted = await client.query<{ reversal_movement_id: string }>(
            `SELECT reversal_movement_id FROM adjustment.reversal_line
             WHERE reversal_request_id = $1 ORDER BY id`, [id]
          );
          return {
            id,
            status: request.status,
            version: request.version,
            movementIds: posted.rows.map((line) => line.reversal_movement_id),
            replayed: true
          };
        }
        this.assertStateVersion(request, 'APPROVED', expectedVersion);
        if (!request.approved_by) throw new ConflictException('Reversal approval is required');
        if (request.requested_by === actorId || request.approved_by === actorId) {
          throw new ConflictException('Poster must be independent from reversal requester and approver');
        }

        const reversalMovementIds: string[] = [];
        for (const movement of movements) {
          const reversed = await client.query<{ id: string }>(
            `SELECT inventory.post_movement(
               'REVERSAL','REVERSAL',$1,$2,$3,$4,$5,
               $6,$7,$8,$9,$10,$11,$12,$13,$14,$15
             ) id`,
            [
              id, `reversal:${movement.id}`, movement.sku_id, movement.batch_id, Number(movement.quantity),
              movement.destination_warehouse_id, movement.destination_location_id, movement.destination_status,
              movement.source_warehouse_id, movement.source_location_id, movement.source_status,
              actorId, correlationId, request.reason, movement.id
            ]
          );
          const reversalMovementId = reversed.rows[0]?.id;
          if (!reversalMovementId) throw new Error('Inventory Core did not return reversal movement');
          reversalMovementIds.push(reversalMovementId);
          await client.query(
            `UPDATE adjustment.reversal_line SET reversal_movement_id = $2
             WHERE reversal_request_id = $1 AND original_movement_id = $3`,
            [id, reversalMovementId, movement.id]
          );
        }

        if (request.original_document_type === 'INVENTORY_ADJUSTMENT') {
          await client.query(
            `UPDATE adjustment.inventory_adjustment
             SET status = 'REVERSED', version = version + 1, updated_at = now()
             WHERE id = $1 AND status = 'POSTED'`, [request.original_document_id]
          );
        }
        if (request.original_document_type === 'LOCATION_TRANSFER') {
          await client.query(
            `UPDATE transfer.stock_transfer
             SET status = 'REVERSED', version = version + 1, updated_at = now()
             WHERE id = $1 AND status IN ('RECEIVED','CLOSED')`, [request.original_document_id]
          );
        }
        const updated = await client.query<{ version: number }>(
          `UPDATE adjustment.reversal_request
           SET status = 'POSTED', posted_by = $2, posted_at = now(), post_idempotency_key = $3,
               post_request_hash = $4, correlation_id = $5, version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, actorId, idempotencyKey, hash, correlationId]
        );
        await this.audit(client, actorId, 'POST', 'REVERSAL_REQUEST', id,
          this.auditWarehouse(movements[0]), correlationId, request.reason);
        await this.outbox(client, 'REVERSAL_REQUEST', id, 'INVENTORY_MOVEMENTS_REVERSED', correlationId, {
          originalMovementIds: movements.map((movement) => movement.id),
          reversalMovementIds
        });
        return { id, status: 'POSTED', version: updated.rows[0]?.version, movementIds: reversalMovementIds, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async cancelRequest(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('Cancellation reason is required');
    return this.db.transaction(async (client) => {
      const request = await this.lockRequest(client, id);
      const movements = await this.lockMovements(client, id);
      for (const movement of movements) await this.authorizeMovement(actorId, movement, client);
      if (request.status === 'CANCELLED') return { id, status: 'CANCELLED', version: request.version, replayed: true };
      if (request.status === 'POSTED') throw new ConflictException('Posted reversal cannot be cancelled');
      if (request.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
      const updated = await client.query<{ version: number }>(
        `UPDATE adjustment.reversal_request
         SET status = 'CANCELLED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CANCEL', 'REVERSAL_REQUEST', id,
        this.auditWarehouse(movements[0]), correlationId, reason.trim());
      return { id, status: 'CANCELLED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  private async changeState(
    actorId: string,
    id: string,
    expectedVersion: number,
    from: string,
    to: string,
    action: string,
    correlationId: string,
    allowDifferentActor: boolean
  ) {
    return this.db.transaction(async (client) => {
      const request = await this.lockRequest(client, id);
      const movements = await this.lockMovements(client, id);
      for (const movement of movements) await this.authorizeMovement(actorId, movement, client);
      if (request.status === to) return { id, status: to, version: request.version, replayed: true };
      this.assertStateVersion(request, from, expectedVersion);
      if (!allowDifferentActor && request.requested_by !== actorId) {
        throw new ForbiddenException('Only the requester can submit this reversal');
      }
      const updated = await client.query<{ version: number }>(
        `UPDATE adjustment.reversal_request
         SET status = $2, version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, to]
      );
      await this.audit(client, actorId, action, 'REVERSAL_REQUEST', id,
        this.auditWarehouse(movements[0]), correlationId, request.reason);
      return { id, status: to, version: updated.rows[0]?.version, replayed: false };
    });
  }

  private async lockRequest(client: PoolClient, id: string): Promise<ReversalRow> {
    const result = await client.query<ReversalRow>(
      `SELECT id, reversal_code, original_document_type, original_document_id, status, reason,
              requested_by, approved_by, posted_by, idempotency_key, request_hash,
              post_idempotency_key, post_request_hash, version, created_at, updated_at
       FROM adjustment.reversal_request WHERE id = $1 FOR UPDATE`, [id]
    );
    const request = result.rows[0];
    if (!request) throw new NotFoundException('Reversal request not found');
    return request;
  }

  private async lockMovements(client: PoolClient, requestId: string): Promise<MovementRow[]> {
    const result = await client.query<MovementRow>(
      `SELECT movement.id, movement.movement_type, movement.document_type, movement.document_id,
              movement.sku_id, movement.batch_id, movement.quantity, movement.source_warehouse_id,
              movement.source_location_id, movement.source_status, movement.destination_warehouse_id,
              movement.destination_location_id, movement.destination_status, movement.reversal_of,
              movement.occurred_at
       FROM adjustment.reversal_line line
       JOIN inventory.inventory_movement_ledger movement ON movement.id = line.original_movement_id
       WHERE line.reversal_request_id = $1
       ORDER BY movement.occurred_at DESC, movement.id DESC FOR UPDATE OF movement`, [requestId]
    );
    if (result.rows.length === 0) throw new ConflictException('Reversal request has no movement');
    return result.rows;
  }

  private assertStateVersion(request: ReversalRow, status: string, expectedVersion: number): void {
    if (request.status !== status) throw new ConflictException(`REVERSAL_STATE_CONFLICT:${request.status}`);
    if (request.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private async authorizeMovement(actorId: string, movement: MovementRow, client?: PoolClient): Promise<void> {
    const warehouses = new Set([movement.source_warehouse_id, movement.destination_warehouse_id].filter((id): id is string => Boolean(id)));
    for (const warehouseId of warehouses) {
      if (!await this.db.hasAccess(actorId, 'ADJUSTMENT.REVERSE', warehouseId, client)) {
        throw new ForbiddenException('Permission or warehouse scope denied');
      }
    }
  }

  private auditWarehouse(movement: MovementRow | undefined): string | null {
    return movement?.destination_warehouse_id ?? movement?.source_warehouse_id ?? null;
  }

  private validateKey(value: string): void {
    if (value.length < 16 || value.length > 128) {
      throw new ConflictException('Idempotency-Key must contain 16 to 128 characters');
    }
  }

  private async audit(
    client: PoolClient,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    warehouseId: string | null,
    correlationId: string,
    reason: string | null
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.audit_event (
         actor_id, action, resource_type, resource_id, warehouse_id, correlation_id, reason, after_data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actorId, action, resourceType, resourceId, warehouseId, correlationId, reason, { status: action }]
    );
  }

  private async outbox(
    client: PoolClient,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    correlationId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO platform.outbox_event (aggregate_type, aggregate_id, event_type, payload, correlation_id)
       VALUES ($1,$2,$3,$4,$5)`, [aggregateType, aggregateId, eventType, payload, correlationId]
    );
  }

  private mapError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const message = error instanceof Error ? error.message : 'Reversal command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Reversal code, original movement or idempotency key already exists');
    }
    if (message.includes('INVENTORY_') || message.includes('REVERSAL_')) throw new ConflictException(message);
    throw error;
  }
}
