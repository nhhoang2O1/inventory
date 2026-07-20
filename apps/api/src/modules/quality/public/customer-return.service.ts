import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { QualityDatabaseService } from './quality-database.service.js';

export interface CreateCustomerReturnInput {
  returnCode: string;
  warehouseId: string;
  customerReference: string;
  reason: string;
  lines: readonly {
    skuId: string;
    batchId: string;
    quarantineLocationId: string;
    quantity: number;
  }[];
}

interface ReturnRow {
  id: string;
  return_code: string;
  warehouse_id: string;
  customer_reference: string;
  reason: string;
  status: string;
  created_by: string;
  approved_by: string | null;
  posted_by: string | null;
  quality_case_id: string | null;
  post_idempotency_key: string | null;
  post_request_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ReturnLineRow {
  id: string;
  line_number: number;
  sku_id: string;
  batch_id: string;
  quarantine_location_id: string;
  quantity: string;
  movement_id: string | null;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizedCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException('Return code is required');
  return normalized;
}

function wholeCase(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ConflictException('Quantity must be a positive whole case quantity');
  return value;
}

@Injectable()
export class CustomerReturnService {
  constructor(private readonly db: QualityDatabaseService) {}

  async list(actorId: string, warehouseId: string) {
    if (!await this.db.hasAccess(actorId, 'RETURN.VIEW', warehouseId)) {
      throw new ForbiddenException('Permission or warehouse scope denied');
    }
    return this.db.query(`
      SELECT cr.id, cr.return_code, cr.customer_reference, cr.reason, cr.status, cr.created_at, cr.quality_case_id,
             coalesce((SELECT sum(quantity::int) FROM quality.customer_return_line WHERE customer_return_id = cr.id), 0)::int as total_qty
      FROM quality.customer_return cr
      WHERE cr.warehouse_id = $1
      ORDER BY cr.created_at DESC
    `, [warehouseId]);
  }

  async create(actorId: string, input: CreateCustomerReturnInput, idempotencyKey: string, correlationId: string) {
    this.validateKey(idempotencyKey);
    await this.authorize(actorId, 'RETURN.CREATE', input.warehouseId);
    const returnCode = normalizedCode(input.returnCode);
    const customerReference = input.customerReference.trim();
    const reason = input.reason.trim();
    if (!customerReference || !reason) throw new ConflictException('Customer reference and reason are required');
    if (input.lines.length === 0) throw new ConflictException('Customer return must have at least one line');
    const lines = input.lines.map((line) => ({ ...line, quantity: wholeCase(line.quantity) }));
    const requestHash = hash({ returnCode, warehouseId: input.warehouseId, customerReference, reason, lines });
    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, request_hash, status, version FROM quality.customer_return
           WHERE created_by = $1 AND idempotency_key = $2 FOR UPDATE`, [actorId, idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
        }
        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO quality.customer_return (
             return_code, warehouse_id, customer_reference, reason,
             created_by, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, version`,
          [returnCode, input.warehouseId, customerReference, reason, actorId, idempotencyKey, requestHash]
        );
        const customerReturn = inserted.rows[0];
        if (!customerReturn) throw new Error('Customer return insert did not return a row');
        for (const [index, line] of lines.entries()) {
          const batch = await client.query<{ sku_id: string }>(`SELECT sku_id FROM inventory.batch WHERE id = $1`, [line.batchId]);
          if (batch.rows[0]?.sku_id !== line.skuId) throw new ConflictException('Return batch does not belong to SKU');
          await this.assertQuarantineLocation(client, line.quarantineLocationId, input.warehouseId);
          await client.query(
            `INSERT INTO quality.customer_return_line (
               customer_return_id, line_number, sku_id, batch_id, quarantine_location_id, quantity
             ) VALUES ($1,$2,$3,$4,$5,$6)`,
            [customerReturn.id, index + 1, line.skuId, line.batchId, line.quarantineLocationId, line.quantity]
          );
        }
        await this.audit(client, actorId, 'CREATE', 'CUSTOMER_RETURN', customerReturn.id, input.warehouseId, correlationId, reason);
        return { id: customerReturn.id, returnCode, status: 'DRAFT', version: customerReturn.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async findOne(actorId: string, id: string) {
    const rows = await this.db.query<ReturnRow>(
      `SELECT id, return_code, warehouse_id, customer_reference, reason, status,
              created_by, approved_by, posted_by, quality_case_id, post_idempotency_key,
              post_request_hash, version, created_at, updated_at
       FROM quality.customer_return WHERE id = $1`, [id]
    );
    const customerReturn = rows[0];
    if (!customerReturn) throw new NotFoundException('Customer return not found');
    await this.authorize(actorId, 'RETURN.VIEW', customerReturn.warehouse_id);
    const lines = await this.db.query<ReturnLineRow>(
      `SELECT id, line_number, sku_id, batch_id, quarantine_location_id, quantity, movement_id
       FROM quality.customer_return_line WHERE customer_return_id = $1 ORDER BY line_number`, [id]
    );
    return { ...customerReturn, lines: lines.map((line) => ({ ...line, quantity: Number(line.quantity) })) };
  }

  async approve(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const customerReturn = await this.lockReturn(client, id);
      await this.authorize(actorId, 'RETURN.APPROVE', customerReturn.warehouse_id, client);
      if (customerReturn.status === 'APPROVED') return { id, status: 'APPROVED', version: customerReturn.version, replayed: true };
      this.assertStateVersion(customerReturn, 'DRAFT', expectedVersion);
      if (customerReturn.created_by === actorId) throw new ConflictException('Creator cannot approve the same return');
      const updated = await client.query<{ version: number }>(
        `UPDATE quality.customer_return
         SET status = 'APPROVED', approved_by = $2, approved_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await this.audit(client, actorId, 'APPROVE', 'CUSTOMER_RETURN', id, customerReturn.warehouse_id, correlationId, customerReturn.reason);
      return { id, status: 'APPROVED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async post(
    actorId: string,
    id: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const requestHash = hash({ id, expectedVersion });
    try {
      return await this.db.transaction(async (client) => {
        const customerReturn = await this.lockReturn(client, id);
        await this.authorize(actorId, 'RETURN.POST', customerReturn.warehouse_id, client);
        if (customerReturn.post_idempotency_key) {
          if (customerReturn.post_idempotency_key !== idempotencyKey || customerReturn.post_request_hash !== requestHash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const movements = await client.query<{ movement_id: string }>(
            `SELECT movement_id FROM quality.customer_return_line WHERE customer_return_id = $1 ORDER BY line_number`, [id]
          );
          return {
            id, qualityCaseId: customerReturn.quality_case_id, status: customerReturn.status,
            version: customerReturn.version, movementIds: movements.rows.map((line) => line.movement_id), replayed: true
          };
        }
        this.assertStateVersion(customerReturn, 'APPROVED', expectedVersion);
        if (!customerReturn.approved_by || customerReturn.created_by === actorId || customerReturn.approved_by === actorId) {
          throw new ConflictException('Return poster must be independent from creator and approver');
        }
        const lines = await this.lockLines(client, id);
        const caseKey = `return-case:${id}`;
        const qualityCase = await client.query<{ id: string }>(
          `INSERT INTO quality.quality_case (
             case_code, case_type, warehouse_id, status, reason, origin_type, origin_id,
             reported_by, contained_by, contained_at, containment_idempotency_key,
             containment_request_hash, idempotency_key, request_hash
           ) VALUES ($1,'CUSTOMER_RETURN',$2,'CONTAINED',$3,'CUSTOMER_RETURN',$4,
             $5,$5,now(),$6,$7,$8,$7) RETURNING id`,
          [`QC-${customerReturn.return_code}`, customerReturn.warehouse_id, customerReturn.reason, id, actorId,
            `return-contain:${id}`, requestHash, caseKey]
        );
        const qualityCaseId = qualityCase.rows[0]?.id;
        if (!qualityCaseId) throw new Error('Return quality case insert did not return a row');
        const movementIds: string[] = [];
        for (const line of lines) {
          const movement = await client.query<{ id: string }>(
            `SELECT inventory.post_movement(
               'RETURN','CUSTOMER_RETURN',$1,$2,$3,$4,$5,
               NULL,NULL,NULL,$6,$7,'QUARANTINED',$8,$9,$10
             ) id`,
            [
              id, `return:${line.id}`, line.sku_id, line.batch_id, Number(line.quantity),
              customerReturn.warehouse_id, line.quarantine_location_id,
              actorId, correlationId, customerReturn.reason
            ]
          );
          const movementId = movement.rows[0]?.id;
          if (!movementId) throw new Error('Inventory Core did not return customer return movement');
          movementIds.push(movementId);
          const balance = await client.query<{ id: string }>(
            `SELECT id FROM inventory.inventory_balance
             WHERE sku_id = $1 AND batch_id = $2 AND warehouse_id = $3
               AND location_id = $4 AND stock_status = 'QUARANTINED'`,
            [line.sku_id, line.batch_id, customerReturn.warehouse_id, line.quarantine_location_id]
          );
          await client.query(
            `INSERT INTO quality.quality_case_line (
               quality_case_id, line_number, balance_id, sku_id, batch_id,
               hold_location_id, hold_status, quantity, hold_movement_id
             ) VALUES ($1,$2,$3,$4,$5,$6,'QUARANTINED',$7,$8)`,
            [qualityCaseId, line.line_number, balance.rows[0]?.id ?? null, line.sku_id, line.batch_id,
              line.quarantine_location_id, Number(line.quantity), movementId]
          );
          await client.query(`UPDATE quality.customer_return_line SET movement_id = $2 WHERE id = $1`, [line.id, movementId]);
        }
        const updated = await client.query<{ version: number }>(
          `UPDATE quality.customer_return
           SET status = 'POSTED', posted_by = $2, posted_at = now(), quality_case_id = $3,
               post_idempotency_key = $4, post_request_hash = $5,
               version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`,
          [id, actorId, qualityCaseId, idempotencyKey, requestHash]
        );
        await this.audit(client, actorId, 'POST', 'CUSTOMER_RETURN', id, customerReturn.warehouse_id, correlationId, customerReturn.reason);
        await this.outbox(client, 'CUSTOMER_RETURN', id, 'CUSTOMER_RETURN_QUARANTINED', correlationId, { qualityCaseId, movementIds });
        return { id, qualityCaseId, status: 'POSTED', version: updated.rows[0]?.version, movementIds, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async cancel(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('Cancellation reason is required');
    return this.db.transaction(async (client) => {
      const customerReturn = await this.lockReturn(client, id);
      await this.authorize(actorId, 'RETURN.CREATE', customerReturn.warehouse_id, client);
      if (customerReturn.status === 'CANCELLED') return { id, status: 'CANCELLED', version: customerReturn.version, replayed: true };
      this.assertStateVersion(customerReturn, 'DRAFT', expectedVersion);
      const updated = await client.query<{ version: number }>(
        `UPDATE quality.customer_return SET status = 'CANCELLED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CANCEL', 'CUSTOMER_RETURN', id, customerReturn.warehouse_id, correlationId, reason.trim());
      return { id, status: 'CANCELLED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  private async lockReturn(client: PoolClient, id: string): Promise<ReturnRow> {
    const result = await client.query<ReturnRow>(
      `SELECT id, return_code, warehouse_id, customer_reference, reason, status,
              created_by, approved_by, posted_by, quality_case_id, post_idempotency_key,
              post_request_hash, version, created_at, updated_at
       FROM quality.customer_return WHERE id = $1 FOR UPDATE`, [id]
    );
    const customerReturn = result.rows[0];
    if (!customerReturn) throw new NotFoundException('Customer return not found');
    return customerReturn;
  }

  private async lockLines(client: PoolClient, id: string): Promise<ReturnLineRow[]> {
    const result = await client.query<ReturnLineRow>(
      `SELECT id, line_number, sku_id, batch_id, quarantine_location_id, quantity, movement_id
       FROM quality.customer_return_line WHERE customer_return_id = $1 ORDER BY line_number FOR UPDATE`, [id]
    );
    if (result.rows.length === 0) throw new ConflictException('Customer return has no lines');
    return result.rows;
  }

  private assertStateVersion(customerReturn: ReturnRow, status: string, expectedVersion: number): void {
    if (customerReturn.status !== status) throw new ConflictException(`RETURN_STATE_CONFLICT:${customerReturn.status}`);
    if (customerReturn.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private async assertQuarantineLocation(client: PoolClient, id: string, warehouseId: string): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM warehouse.location location
       JOIN warehouse.zone zone ON zone.id = location.zone_id
       WHERE location.id = $1 AND zone.warehouse_id = $2 AND zone.zone_type = 'QUARANTINE'
         AND location.status = 'ACTIVE'`, [id, warehouseId]
    );
    if (result.rowCount !== 1) throw new ConflictException('Active quarantine location does not belong to warehouse');
  }

  private async authorize(actorId: string, permission: string, warehouseId: string, client?: PoolClient): Promise<void> {
    if (!await this.db.hasAccess(actorId, permission, warehouseId, client)) {
      throw new ForbiddenException('Permission or warehouse scope denied');
    }
  }

  private validateKey(value: string): void {
    if (value.length < 16 || value.length > 128) throw new ConflictException('Idempotency-Key must contain 16 to 128 characters');
  }

  private async audit(
    client: PoolClient, actorId: string, action: string, resourceType: string,
    resourceId: string, warehouseId: string, correlationId: string, reason: string | null
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.audit_event (
         actor_id, action, resource_type, resource_id, warehouse_id, correlation_id, reason, after_data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actorId, action, resourceType, resourceId, warehouseId, correlationId, reason, { status: action }]
    );
  }

  private async outbox(
    client: PoolClient, aggregateType: string, aggregateId: string,
    eventType: string, correlationId: string, payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO platform.outbox_event (aggregate_type, aggregate_id, event_type, payload, correlation_id)
       VALUES ($1,$2,$3,$4,$5)`, [aggregateType, aggregateId, eventType, payload, correlationId]
    );
  }

  private mapError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const message = error instanceof Error ? error.message : 'Return command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Return code or idempotency key already exists');
    }
    if (message.includes('INVENTORY_') || message.includes('RETURN_') || message.includes('RECALL_')) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
