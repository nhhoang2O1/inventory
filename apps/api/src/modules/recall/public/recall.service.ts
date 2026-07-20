import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { RecallDatabaseService } from './recall-database.service.js';

export interface CreateRecallInput {
  recallCode: string;
  skuId: string;
  batchId: string;
  severity: 'CLASS_I' | 'CLASS_II' | 'CLASS_III';
  reason: string;
  scopes: readonly { warehouseId: string; recallLocationId: string }[];
}

interface RecallRow {
  id: string;
  recall_code: string;
  sku_id: string;
  batch_id: string;
  severity: string;
  reason: string;
  status: string;
  created_by: string;
  approved_by: string | null;
  contained_by: string | null;
  containment_idempotency_key: string | null;
  containment_request_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RecallScopeRow {
  id: string;
  warehouse_id: string;
  recall_location_id: string;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException('Recall code is required');
  return normalized;
}

@Injectable()
export class RecallService {
  constructor(private readonly db: RecallDatabaseService) {}

  async listRecalls(actorId: string, warehouseId: string) {
    await this.authorize(actorId, 'RECALL.VIEW', warehouseId);
    return this.db.query(`
      SELECT DISTINCT rc.id, rc.recall_code, rc.severity, rc.reason, rc.status, rc.created_at,
             sku.sku_code, sku.name AS sku_name, batch.batch_code
      FROM recall.recall_case rc
      JOIN recall.recall_scope rs ON rs.recall_case_id = rc.id
      JOIN catalog.sku sku ON sku.id = rc.sku_id
      JOIN inventory.batch batch ON batch.id = rc.batch_id
      WHERE rs.warehouse_id = $1
      ORDER BY rc.created_at DESC
    `, [warehouseId]);
  }

  async create(actorId: string, input: CreateRecallInput, idempotencyKey: string, correlationId: string) {
    this.validateKey(idempotencyKey);
    const recallCode = normalizeCode(input.recallCode);
    const reason = input.reason.trim();
    if (!reason) throw new ConflictException('Recall reason is required');
    if (!['CLASS_I', 'CLASS_II', 'CLASS_III'].includes(input.severity)) throw new ConflictException('Unsupported recall severity');
    if (input.scopes.length === 0) throw new ConflictException('Recall must contain at least one warehouse scope');
    if (new Set(input.scopes.map((scope) => scope.warehouseId)).size !== input.scopes.length) {
      throw new ConflictException('Recall contains duplicate warehouse scopes');
    }
    for (const scope of input.scopes) await this.authorize(actorId, 'RECALL.CREATE', scope.warehouseId);
    const normalizedScopes = [...input.scopes].sort((left, right) => left.warehouseId.localeCompare(right.warehouseId));
    const requestHash = hash({ recallCode, skuId: input.skuId, batchId: input.batchId, severity: input.severity, reason, scopes: normalizedScopes });
    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, request_hash, status, version FROM recall.recall_case
           WHERE created_by = $1 AND idempotency_key = $2 FOR UPDATE`, [actorId, idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
        }
        const batch = await client.query<{ sku_id: string }>(`SELECT sku_id FROM inventory.batch WHERE id = $1`, [input.batchId]);
        if (batch.rows[0]?.sku_id !== input.skuId) throw new ConflictException('Recall batch does not belong to SKU');
        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO recall.recall_case (
             recall_code, sku_id, batch_id, severity, reason,
             created_by, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, version`,
          [recallCode, input.skuId, input.batchId, input.severity, reason, actorId, idempotencyKey, requestHash]
        );
        const recall = inserted.rows[0];
        if (!recall) throw new Error('Recall insert did not return a row');
        for (const scope of normalizedScopes) {
          await this.assertRecallLocation(client, scope.recallLocationId, scope.warehouseId);
          await client.query(
            `INSERT INTO recall.recall_scope (recall_case_id, warehouse_id, recall_location_id)
             VALUES ($1,$2,$3)`, [recall.id, scope.warehouseId, scope.recallLocationId]
          );
        }
        await this.audit(client, actorId, 'CREATE', 'RECALL_CASE', recall.id, normalizedScopes[0]!.warehouseId, correlationId, reason);
        return { id: recall.id, recallCode, status: 'DRAFT', version: recall.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async findOne(actorId: string, id: string) {
    const recalls = await this.db.query<RecallRow>(
      `SELECT id, recall_code, sku_id, batch_id, severity, reason, status,
              created_by, approved_by, contained_by, containment_idempotency_key,
              containment_request_hash, version, created_at, updated_at
       FROM recall.recall_case WHERE id = $1`, [id]
    );
    const recall = recalls[0];
    if (!recall) throw new NotFoundException('Recall case not found');
    const scopes = await this.db.query<RecallScopeRow>(
      `SELECT id, warehouse_id, recall_location_id FROM recall.recall_scope
       WHERE recall_case_id = $1 ORDER BY warehouse_id`, [id]
    );
    for (const scope of scopes) await this.authorize(actorId, 'RECALL.VIEW', scope.warehouse_id);
    const warehouseIds = scopes.map((scope) => scope.warehouse_id);
    const [qualityCases, traceability] = await Promise.all([
      this.db.query(
        `SELECT quality_case.id, quality_case.case_code, quality_case.warehouse_id,
                quality_case.status, quality_case.reason
         FROM recall.recall_scope scope
         JOIN quality.quality_case quality_case
           ON quality_case.origin_type = 'RECALL_CASE' AND quality_case.origin_id = scope.id
         WHERE scope.recall_case_id = $1 ORDER BY quality_case.warehouse_id`, [id]),
      this.db.query(
        `SELECT movement.id, movement.movement_type, movement.document_type, movement.document_id,
                movement.quantity, movement.source_warehouse_id, movement.source_location_id,
                movement.source_status, movement.destination_warehouse_id,
                movement.destination_location_id, movement.destination_status,
                movement.occurred_at
         FROM inventory.inventory_movement_ledger movement
         WHERE movement.batch_id = $1
           AND (movement.source_warehouse_id = ANY($2::uuid[]) OR movement.destination_warehouse_id = ANY($2::uuid[]))
         ORDER BY movement.occurred_at, movement.id`, [recall.batch_id, warehouseIds])
    ]);
    return {
      ...recall,
      scopes,
      qualityCases,
      traceability: traceability.map((movement) => ({ ...movement, quantity: Number(movement.quantity) }))
    };
  }

  async approve(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const recall = await this.lockRecall(client, id);
      const scopes = await this.lockScopes(client, id);
      await this.authorizeScopes(actorId, 'RECALL.APPROVE', scopes, client);
      if (recall.status === 'APPROVED') return { id, status: 'APPROVED', version: recall.version, replayed: true };
      this.assertStateVersion(recall, 'DRAFT', expectedVersion);
      if (recall.created_by === actorId) throw new ConflictException('Creator cannot approve the same recall');
      const updated = await client.query<{ version: number }>(
        `UPDATE recall.recall_case
         SET status = 'APPROVED', approved_by = $2, approved_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await this.audit(client, actorId, 'APPROVE', 'RECALL_CASE', id, scopes[0]!.warehouse_id, correlationId, recall.reason);
      await this.outbox(client, 'RECALL_CASE', id, 'RECALL_APPROVED', correlationId, { batchId: recall.batch_id });
      return { id, status: 'APPROVED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async contain(
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
        const recall = await this.lockRecall(client, id);
        const scopes = await this.lockScopes(client, id);
        await this.authorizeScopes(actorId, 'RECALL.CONTAIN', scopes, client);
        if (recall.containment_idempotency_key) {
          if (recall.containment_idempotency_key !== idempotencyKey || recall.containment_request_hash !== requestHash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const movements = await client.query<{ id: string }>(
            `SELECT id FROM inventory.inventory_movement_ledger
             WHERE document_type = 'RECALL_CONTAINMENT' AND document_id = $1 ORDER BY command_key`, [id]
          );
          const qualityCases = await client.query<{ id: string }>(
            `SELECT quality_case.id FROM recall.recall_scope scope
             JOIN quality.quality_case quality_case
               ON quality_case.origin_type = 'RECALL_CASE' AND quality_case.origin_id = scope.id
             WHERE scope.recall_case_id = $1 ORDER BY quality_case.id`, [id]
          );
          return {
            id, status: recall.status, version: recall.version,
            movementIds: movements.rows.map((movement) => movement.id),
            qualityCaseIds: qualityCases.rows.map((qualityCase) => qualityCase.id), replayed: true
          };
        }
        this.assertStateVersion(recall, 'APPROVED', expectedVersion);
        if (!recall.approved_by || recall.created_by === actorId || recall.approved_by === actorId) {
          throw new ConflictException('Recall containment actor must be independent from creator and approver');
        }
        const balances = await client.query<{
          id: string; sku_id: string; batch_id: string; warehouse_id: string;
          location_id: string; stock_status: string; quantity_on_hand: string;
        }>(
          `SELECT id, sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand
           FROM inventory.inventory_balance
           WHERE batch_id = $1 AND quantity_on_hand > 0 ORDER BY warehouse_id, id FOR UPDATE`, [recall.batch_id]
        );
        const scopeMap = new Map(scopes.map((scope) => [scope.warehouse_id, scope]));
        const unscoped = balances.rows.find((balance) => !scopeMap.has(balance.warehouse_id));
        if (unscoped) throw new ConflictException(`RECALL_UNSCOPED_STOCK:${unscoped.warehouse_id}`);
        const movementIds: string[] = [];
        const qualityCaseIds: string[] = [];
        for (const scope of scopes) {
          const scopedBalances = balances.rows.filter((balance) => balance.warehouse_id === scope.warehouse_id);
          if (scopedBalances.length === 0) continue;
          const qualityCase = await client.query<{ id: string }>(
            `INSERT INTO quality.quality_case (
               case_code, case_type, warehouse_id, status, reason, origin_type, origin_id,
               reported_by, contained_by, contained_at, containment_idempotency_key,
               containment_request_hash, idempotency_key, request_hash
             ) VALUES ($1,'RECALL',$2,'CONTAINED',$3,'RECALL_CASE',$4,
               $5,$5,now(),$6,$7,$8,$7) RETURNING id`,
            [
              `QC-${recall.recall_code}-${scope.id.slice(0, 8).toUpperCase()}`,
              scope.warehouse_id, recall.reason, scope.id, actorId,
              `recall-contain:${scope.id}`, requestHash, `recall-case:${scope.id}`
            ]
          );
          const qualityCaseId = qualityCase.rows[0]?.id;
          if (!qualityCaseId) throw new Error('Recall quality case insert did not return a row');
          qualityCaseIds.push(qualityCaseId);
          for (const [index, balance] of scopedBalances.entries()) {
            let movementId: string | null = null;
            if (balance.location_id !== scope.recall_location_id || balance.stock_status !== 'RECALLED') {
              const movement = await client.query<{ id: string }>(
                `SELECT inventory.post_movement(
                   'STATUS_CHANGE','RECALL_CONTAINMENT',$1,$2,$3,$4,$5,
                   $6,$7,$8,$6,$9,'RECALLED',$10,$11,$12
                 ) id`,
                [
                  id, `recall:${balance.id}`, balance.sku_id, balance.batch_id, Number(balance.quantity_on_hand),
                  balance.warehouse_id, balance.location_id, balance.stock_status,
                  scope.recall_location_id, actorId, correlationId, recall.reason
                ]
              );
              movementId = movement.rows[0]?.id ?? null;
              if (!movementId) throw new Error('Inventory Core did not return recall containment movement');
              movementIds.push(movementId);
            }
            await client.query(
              `INSERT INTO quality.quality_case_line (
                 quality_case_id, line_number, balance_id, sku_id, batch_id, source_location_id,
                 source_status, hold_location_id, hold_status, quantity, hold_movement_id
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'RECALLED',$9,$10)`,
              [
                qualityCaseId, index + 1, balance.id, balance.sku_id, balance.batch_id,
                balance.location_id, balance.stock_status, scope.recall_location_id,
                Number(balance.quantity_on_hand), movementId
              ]
            );
          }
        }
        const updated = await client.query<{ version: number }>(
          `UPDATE recall.recall_case
           SET status = 'CONTAINED', contained_by = $2, contained_at = now(),
               containment_idempotency_key = $3, containment_request_hash = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, actorId, idempotencyKey, requestHash]
        );
        await this.audit(client, actorId, 'CONTAIN', 'RECALL_CASE', id, scopes[0]!.warehouse_id, correlationId, recall.reason);
        await this.outbox(client, 'RECALL_CASE', id, 'RECALL_STOCK_CONTAINED', correlationId, { qualityCaseIds, movementIds });
        return { id, status: 'CONTAINED', version: updated.rows[0]?.version, qualityCaseIds, movementIds, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async close(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('Closure reason is required');
    return this.db.transaction(async (client) => {
      const recall = await this.lockRecall(client, id);
      const scopes = await this.lockScopes(client, id);
      await this.authorizeScopes(actorId, 'RECALL.CLOSE', scopes, client);
      if (recall.status === 'CLOSED') return { id, status: 'CLOSED', version: recall.version, replayed: true };
      this.assertStateVersion(recall, 'CONTAINED', expectedVersion);
      const openCases = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM recall.recall_scope scope
         JOIN quality.quality_case quality_case
           ON quality_case.origin_type = 'RECALL_CASE' AND quality_case.origin_id = scope.id
         WHERE scope.recall_case_id = $1 AND quality_case.status <> 'CLOSED'`, [id]
      );
      if (Number(openCases.rows[0]?.count ?? 0) > 0) throw new ConflictException('Recall quality cases must be fully dispositioned before close');
      const recalled = await client.query<{ quantity: string }>(
        `SELECT coalesce(sum(quantity_on_hand),0)::text AS quantity FROM inventory.inventory_balance
         WHERE batch_id = $1 AND stock_status = 'RECALLED' AND quantity_on_hand > 0`, [recall.batch_id]
      );
      if (Number(recalled.rows[0]?.quantity ?? 0) > 0) throw new ConflictException('Recalled stock remains on hand');
      const updated = await client.query<{ version: number }>(
        `UPDATE recall.recall_case SET status = 'CLOSED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CLOSE', 'RECALL_CASE', id, scopes[0]!.warehouse_id, correlationId, reason.trim());
      return { id, status: 'CLOSED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async cancel(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('Cancellation reason is required');
    return this.db.transaction(async (client) => {
      const recall = await this.lockRecall(client, id);
      const scopes = await this.lockScopes(client, id);
      await this.authorizeScopes(actorId, 'RECALL.CREATE', scopes, client);
      if (recall.status === 'CANCELLED') return { id, status: 'CANCELLED', version: recall.version, replayed: true };
      this.assertStateVersion(recall, 'DRAFT', expectedVersion);
      const updated = await client.query<{ version: number }>(
        `UPDATE recall.recall_case SET status = 'CANCELLED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CANCEL', 'RECALL_CASE', id, scopes[0]!.warehouse_id, correlationId, reason.trim());
      return { id, status: 'CANCELLED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  private async lockRecall(client: PoolClient, id: string): Promise<RecallRow> {
    const result = await client.query<RecallRow>(
      `SELECT id, recall_code, sku_id, batch_id, severity, reason, status,
              created_by, approved_by, contained_by, containment_idempotency_key,
              containment_request_hash, version, created_at, updated_at
       FROM recall.recall_case WHERE id = $1 FOR UPDATE`, [id]
    );
    const recall = result.rows[0];
    if (!recall) throw new NotFoundException('Recall case not found');
    return recall;
  }

  private async lockScopes(client: PoolClient, id: string): Promise<RecallScopeRow[]> {
    const result = await client.query<RecallScopeRow>(
      `SELECT id, warehouse_id, recall_location_id FROM recall.recall_scope
       WHERE recall_case_id = $1 ORDER BY warehouse_id FOR UPDATE`, [id]
    );
    if (result.rows.length === 0) throw new ConflictException('Recall has no warehouse scope');
    return result.rows;
  }

  private assertStateVersion(recall: RecallRow, status: string, expectedVersion: number): void {
    if (recall.status !== status) throw new ConflictException(`RECALL_STATE_CONFLICT:${recall.status}`);
    if (recall.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private async assertRecallLocation(client: PoolClient, id: string, warehouseId: string): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM warehouse.location location
       JOIN warehouse.zone zone ON zone.id = location.zone_id
       WHERE location.id = $1 AND zone.warehouse_id = $2 AND zone.zone_type = 'QUARANTINE'
         AND location.status = 'ACTIVE'`, [id, warehouseId]
    );
    if (result.rowCount !== 1) throw new ConflictException('Active recall quarantine location does not belong to warehouse');
  }

  private async authorizeScopes(
    actorId: string,
    permission: string,
    scopes: readonly RecallScopeRow[],
    client?: PoolClient
  ): Promise<void> {
    for (const scope of scopes) await this.authorize(actorId, permission, scope.warehouse_id, client);
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
    const message = error instanceof Error ? error.message : 'Recall command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Recall code, active batch recall or idempotency key already exists');
    }
    if (message.includes('INVENTORY_') || message.includes('RECALL_')) throw new ConflictException(message);
    throw error;
  }
}
