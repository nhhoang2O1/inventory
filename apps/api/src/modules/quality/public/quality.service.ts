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

type HoldStatus = 'BLOCKED' | 'QUARANTINED' | 'DAMAGED';
type DispositionType = 'RELEASE' | 'DESTROY' | 'RETURN_TO_SUPPLIER' | 'RECLASSIFY_DAMAGED';

export interface CreateQualityCaseInput {
  caseCode: string;
  caseType: 'DAMAGE' | 'TEMPERATURE' | 'PACKAGING' | 'OTHER';
  warehouseId: string;
  reason: string;
  lines: readonly {
    balanceId: string;
    holdLocationId: string;
    holdStatus?: HoldStatus;
    quantity: number;
  }[];
}

export interface CreateDispositionInput {
  dispositionCode: string;
  dispositionType: DispositionType;
  reason: string;
  destinations?: readonly { qualityCaseLineId: string; destinationLocationId: string }[];
}

interface QualityCaseRow {
  id: string;
  case_code: string;
  case_type: string;
  warehouse_id: string;
  status: string;
  reason: string;
  origin_type: string | null;
  origin_id: string | null;
  reported_by: string;
  contained_by: string | null;
  containment_idempotency_key: string | null;
  containment_request_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface QualityLineRow {
  id: string;
  line_number: number;
  balance_id: string | null;
  sku_id: string;
  batch_id: string;
  source_location_id: string | null;
  source_status: string | null;
  hold_location_id: string;
  hold_status: string;
  quantity: string;
  hold_movement_id: string | null;
}

interface DispositionRow {
  id: string;
  disposition_code: string;
  quality_case_id: string;
  disposition_type: DispositionType;
  status: string;
  reason: string;
  requested_by: string;
  approved_by: string | null;
  post_idempotency_key: string | null;
  post_request_hash: string | null;
  version: number;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function code(value: string, name: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException(`${name} is required`);
  return normalized;
}

function quantity(value: number, name = 'quantity'): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConflictException(`${name} must be a positive whole case quantity`);
  }
  return value;
}

@Injectable()
export class QualityService {
  constructor(private readonly db: QualityDatabaseService) {}

  async listCases(actorId: string, warehouseId: string) {
    await this.authorize(actorId, 'QUALITY.VIEW', warehouseId);
    return this.db.query(`
      SELECT qc.id, qc.case_code, qc.case_type, qc.status, qc.reason, qc.created_at,
             qcl.id AS case_line_id, qcl.sku_id, sku.sku_code, sku.name AS sku_name, qcl.batch_id, batch.batch_code,
             qcl.quantity::int AS quantity, qcl.source_location_id AS location_id, loc.location_code,
             qd.disposition_type
      FROM quality.quality_case qc
      LEFT JOIN quality.quality_case_line qcl ON qcl.quality_case_id = qc.id
      LEFT JOIN catalog.sku sku ON sku.id = qcl.sku_id
      LEFT JOIN inventory.batch batch ON batch.id = qcl.batch_id
      LEFT JOIN warehouse.location loc ON loc.id = qcl.source_location_id
      LEFT JOIN quality.quality_disposition qd ON qd.quality_case_id = qc.id
      WHERE qc.warehouse_id = $1
      ORDER BY qc.created_at DESC
    `, [warehouseId]);
  }

  async listExpiryRuns(actorId: string, warehouseId: string) {
    await this.authorize(actorId, 'QUALITY.EXPIRY', warehouseId);
    return this.db.query(`
      SELECT er.id, er.business_date, er.expired_line_count, er.created_at, er.quality_case_id
      FROM quality.expiry_run er
      WHERE er.warehouse_id = $1
      ORDER BY er.created_at DESC
    `, [warehouseId]);
  }

  async createCase(actorId: string, input: CreateQualityCaseInput, idempotencyKey: string, correlationId: string) {
    this.validateKey(idempotencyKey);
    await this.authorize(actorId, 'QUALITY.CREATE', input.warehouseId);
    const caseCode = code(input.caseCode, 'Case code');
    const reason = input.reason.trim();
    if (!reason) throw new ConflictException('Quality reason is required');
    if (!['DAMAGE', 'TEMPERATURE', 'PACKAGING', 'OTHER'].includes(input.caseType)) {
      throw new ConflictException('Manual quality case type is unsupported');
    }
    if (input.lines.length === 0) throw new ConflictException('Quality case must have at least one line');
    if (new Set(input.lines.map((line) => line.balanceId)).size !== input.lines.length) {
      throw new ConflictException('Quality case contains duplicate balance lines');
    }
    const normalizedLines = input.lines.map((line) => ({
      ...line,
      holdStatus: line.holdStatus ?? 'QUARANTINED',
      quantity: quantity(line.quantity)
    }));
    const requestHash = hash({ caseCode, caseType: input.caseType, warehouseId: input.warehouseId, reason, lines: normalizedLines });

    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, request_hash, status, version FROM quality.quality_case
           WHERE reported_by = $1 AND idempotency_key = $2 FOR UPDATE`, [actorId, idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
        }
        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO quality.quality_case (
             case_code, case_type, warehouse_id, reason, reported_by, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, version`,
          [caseCode, input.caseType, input.warehouseId, reason, actorId, idempotencyKey, requestHash]
        );
        const qualityCase = inserted.rows[0];
        if (!qualityCase) throw new Error('Quality case insert did not return a row');

        for (const [index, line] of normalizedLines.entries()) {
          const balance = await client.query<{
            sku_id: string; batch_id: string; warehouse_id: string; location_id: string; stock_status: string; quantity_on_hand: string;
          }>(
            `SELECT sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand
             FROM inventory.inventory_balance WHERE id = $1`, [line.balanceId]
          );
          const source = balance.rows[0];
          if (!source || source.warehouse_id !== input.warehouseId) throw new NotFoundException('Scoped inventory balance not found');
          if (Number(source.quantity_on_hand) < line.quantity) throw new ConflictException('INVENTORY_ON_HAND_INSUFFICIENT');
          if (source.stock_status === 'IN_TRANSIT' || source.stock_status === 'RECALLED') {
            throw new ConflictException(`Stock status ${source.stock_status} requires its dedicated workflow`);
          }
          await this.assertLocation(
            client,
            line.holdLocationId,
            input.warehouseId,
            line.holdStatus === 'QUARANTINED' ? 'QUARANTINE' : line.holdStatus === 'DAMAGED' ? 'DAMAGED' : undefined
          );
          if (source.location_id === line.holdLocationId && source.stock_status === line.holdStatus) {
            throw new ConflictException('Hold destination must change location or stock status');
          }
          await client.query(
            `INSERT INTO quality.quality_case_line (
               quality_case_id, line_number, balance_id, sku_id, batch_id, source_location_id,
               source_status, hold_location_id, hold_status, quantity
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              qualityCase.id, index + 1, line.balanceId, source.sku_id, source.batch_id,
              source.location_id, source.stock_status, line.holdLocationId, line.holdStatus, line.quantity
            ]
          );
        }
        await this.audit(client, actorId, 'CREATE', 'QUALITY_CASE', qualityCase.id, input.warehouseId, correlationId, reason);
        return { id: qualityCase.id, caseCode, status: 'DRAFT', version: qualityCase.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async findCase(actorId: string, id: string) {
    const cases = await this.db.query<QualityCaseRow>(
      `SELECT id, case_code, case_type, warehouse_id, status, reason, origin_type, origin_id,
              reported_by, contained_by, containment_idempotency_key, containment_request_hash,
              version, created_at, updated_at
       FROM quality.quality_case WHERE id = $1`, [id]
    );
    const qualityCase = cases[0];
    if (!qualityCase) throw new NotFoundException('Quality case not found');
    await this.authorize(actorId, 'QUALITY.VIEW', qualityCase.warehouse_id);
    const [lines, dispositions] = await Promise.all([
      this.db.query<QualityLineRow>(
        `SELECT id, line_number, balance_id, sku_id, batch_id, source_location_id, source_status,
                hold_location_id, hold_status, quantity, hold_movement_id
         FROM quality.quality_case_line WHERE quality_case_id = $1 ORDER BY line_number`, [id]),
      this.db.query(
        `SELECT id, disposition_code, disposition_type, status, reason, requested_by,
                approved_by, posted_by, version, created_at, updated_at
         FROM quality.quality_disposition WHERE quality_case_id = $1`, [id])
    ]);
    return {
      ...qualityCase,
      lines: lines.map((line) => ({ ...line, quantity: Number(line.quantity) })),
      disposition: dispositions[0] ?? null
    };
  }

  async containCase(
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
        const qualityCase = await this.lockCase(client, id);
        await this.authorize(actorId, 'QUALITY.HOLD', qualityCase.warehouse_id, client);
        if (qualityCase.containment_idempotency_key) {
          if (qualityCase.containment_idempotency_key !== idempotencyKey || qualityCase.containment_request_hash !== requestHash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const movements = await client.query<{ hold_movement_id: string }>(
            `SELECT hold_movement_id FROM quality.quality_case_line WHERE quality_case_id = $1 ORDER BY line_number`, [id]
          );
          return { id, status: qualityCase.status, version: qualityCase.version, movementIds: movements.rows.map((row) => row.hold_movement_id), replayed: true };
        }
        this.assertStateVersion(qualityCase, 'DRAFT', expectedVersion);
        const lines = await this.lockLines(client, id);
        const movementIds: string[] = [];
        for (const line of lines) {
          if (!line.balance_id || !line.source_location_id || !line.source_status) throw new ConflictException('Manual hold line has no source balance');
          const current = await client.query<{ quantity_on_hand: string; location_id: string; stock_status: string }>(
            `SELECT quantity_on_hand, location_id, stock_status FROM inventory.inventory_balance WHERE id = $1 FOR UPDATE`, [line.balance_id]
          );
          const balance = current.rows[0];
          if (!balance || balance.location_id !== line.source_location_id || balance.stock_status !== line.source_status
            || Number(balance.quantity_on_hand) < Number(line.quantity)) {
            throw new ConflictException(`QUALITY_SOURCE_CHANGED:${line.id}`);
          }
          const movementId = await this.postMovement(client, {
            movementType: 'STATUS_CHANGE', documentType: 'QUALITY_HOLD', documentId: id,
            commandKey: `hold:${line.id}`, skuId: line.sku_id, batchId: line.batch_id,
            quantity: Number(line.quantity), sourceWarehouseId: qualityCase.warehouse_id,
            sourceLocationId: line.source_location_id, sourceStatus: line.source_status,
            destinationWarehouseId: qualityCase.warehouse_id, destinationLocationId: line.hold_location_id,
            destinationStatus: line.hold_status, actorId, correlationId, reason: qualityCase.reason
          });
          movementIds.push(movementId);
          await client.query(`UPDATE quality.quality_case_line SET hold_movement_id = $2 WHERE id = $1`, [line.id, movementId]);
        }
        const updated = await client.query<{ version: number }>(
          `UPDATE quality.quality_case
           SET status = 'CONTAINED', contained_by = $2, contained_at = now(),
               containment_idempotency_key = $3, containment_request_hash = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, actorId, idempotencyKey, requestHash]
        );
        await this.audit(client, actorId, 'CONTAIN', 'QUALITY_CASE', id, qualityCase.warehouse_id, correlationId, qualityCase.reason);
        await this.outbox(client, 'QUALITY_CASE', id, 'QUALITY_STOCK_CONTAINED', correlationId, { movementIds });
        return { id, status: 'CONTAINED', version: updated.rows[0]?.version, movementIds, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async requestDisposition(
    actorId: string,
    caseId: string,
    input: CreateDispositionInput,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const dispositionCode = code(input.dispositionCode, 'Disposition code');
    const reason = input.reason.trim();
    if (!reason) throw new ConflictException('Disposition reason is required');
    if (!['RELEASE', 'DESTROY', 'RETURN_TO_SUPPLIER', 'RECLASSIFY_DAMAGED'].includes(input.dispositionType)) {
      throw new ConflictException('Unsupported disposition type');
    }
    const destinations = input.destinations ?? [];
    const requestHash = hash({ caseId, dispositionCode, dispositionType: input.dispositionType, reason, destinations });
    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; quality_case_id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, quality_case_id, request_hash, status, version FROM quality.quality_disposition
           WHERE requested_by = $1 AND idempotency_key = $2 FOR UPDATE`, [actorId, idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.quality_case_id !== caseId || existing.request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, caseId, status: existing.status, version: existing.version, replayed: true };
        }
        const qualityCase = await this.lockCase(client, caseId);
        await this.authorize(actorId, 'QUALITY.DISPOSITION', qualityCase.warehouse_id, client);
        this.assertStateVersion(qualityCase, 'CONTAINED', expectedVersion);
        if (qualityCase.case_type === 'EXPIRY' && input.dispositionType === 'RELEASE') {
          throw new ConflictException('Expired stock cannot be released to AVAILABLE');
        }
        if (qualityCase.origin_type === 'RECALL_CASE' && input.dispositionType === 'RELEASE') {
          throw new ConflictException('Recalled stock cannot be released by the general quality disposition workflow');
        }
        const lines = await this.lockLines(client, caseId);
        const needsDestination = ['RELEASE', 'RECLASSIFY_DAMAGED'].includes(input.dispositionType);
        const destinationMap = new Map(destinations.map((item) => [item.qualityCaseLineId, item.destinationLocationId]));
        if (needsDestination && (destinationMap.size !== lines.length || destinations.length !== lines.length)) {
          throw new ConflictException('Every quality line requires exactly one disposition destination');
        }
        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO quality.quality_disposition (
             disposition_code, quality_case_id, disposition_type, reason,
             requested_by, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, version`,
          [dispositionCode, caseId, input.dispositionType, reason, actorId, idempotencyKey, requestHash]
        );
        const disposition = inserted.rows[0];
        if (!disposition) throw new Error('Disposition insert did not return a row');
        for (const line of lines) {
          const destinationLocationId = needsDestination ? destinationMap.get(line.id) : undefined;
          if (needsDestination && !destinationLocationId) {
            throw new ConflictException(`Missing disposition destination for quality line ${line.id}`);
          }
          if (destinationLocationId) {
            await this.assertLocation(
              client,
              destinationLocationId,
              qualityCase.warehouse_id,
              input.dispositionType === 'RECLASSIFY_DAMAGED' ? 'DAMAGED' : undefined
            );
          }
          const destinationStatus = input.dispositionType === 'RELEASE'
            ? 'AVAILABLE'
            : input.dispositionType === 'RECLASSIFY_DAMAGED' ? 'DAMAGED' : null;
          await client.query(
            `INSERT INTO quality.quality_disposition_line (
               quality_disposition_id, quality_case_line_id, quantity,
               destination_location_id, destination_status
             ) VALUES ($1,$2,$3,$4,$5)`,
            [disposition.id, line.id, Number(line.quantity), destinationLocationId ?? null, destinationStatus]
          );
        }
        const caseUpdate = await client.query<{ version: number }>(
          `UPDATE quality.quality_case SET status = 'PENDING_DISPOSITION', version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [caseId]
        );
        await this.audit(client, actorId, 'REQUEST_DISPOSITION', 'QUALITY_DISPOSITION', disposition.id,
          qualityCase.warehouse_id, correlationId, reason);
        return {
          id: disposition.id,
          caseId,
          status: 'SUBMITTED',
          version: disposition.version,
          caseVersion: caseUpdate.rows[0]?.version,
          replayed: false
        };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async approveDisposition(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const disposition = await this.lockDisposition(client, id);
      const qualityCase = await this.lockCase(client, disposition.quality_case_id);
      await this.authorize(actorId, 'QUALITY.APPROVE', qualityCase.warehouse_id, client);
      if (disposition.status === 'APPROVED') return { id, status: disposition.status, version: disposition.version, replayed: true };
      if (disposition.status !== 'SUBMITTED') throw new ConflictException(`QUALITY_DISPOSITION_STATE_CONFLICT:${disposition.status}`);
      if (disposition.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
      if (disposition.requested_by === actorId || qualityCase.reported_by === actorId) {
        throw new ConflictException('Reporter/requester cannot approve the same disposition');
      }
      const updated = await client.query<{ version: number }>(
        `UPDATE quality.quality_disposition
         SET status = 'APPROVED', approved_by = $2, approved_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await this.audit(client, actorId, 'APPROVE', 'QUALITY_DISPOSITION', id, qualityCase.warehouse_id, correlationId, disposition.reason);
      return { id, status: 'APPROVED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async rejectDisposition(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('Rejection reason is required');
    return this.db.transaction(async (client) => {
      const disposition = await this.lockDisposition(client, id);
      const qualityCase = await this.lockCase(client, disposition.quality_case_id);
      await this.authorize(actorId, 'QUALITY.APPROVE', qualityCase.warehouse_id, client);
      if (disposition.status !== 'SUBMITTED') throw new ConflictException(`QUALITY_DISPOSITION_STATE_CONFLICT:${disposition.status}`);
      if (disposition.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
      if (disposition.requested_by === actorId || qualityCase.reported_by === actorId) throw new ConflictException('FOUR_EYES_VIOLATION');
      const updated = await client.query<{ version: number }>(
        `UPDATE quality.quality_disposition
         SET status = 'REJECTED', approved_by = $2, approved_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await client.query(
        `UPDATE quality.quality_case SET status = 'CONTAINED', version = version + 1, updated_at = now() WHERE id = $1`,
        [qualityCase.id]
      );
      await this.audit(client, actorId, 'REJECT', 'QUALITY_DISPOSITION', id, qualityCase.warehouse_id, correlationId, reason.trim());
      return { id, status: 'REJECTED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async postDisposition(
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
        const disposition = await this.lockDisposition(client, id);
        const qualityCase = await this.lockCase(client, disposition.quality_case_id);
        await this.authorize(actorId, 'QUALITY.POST', qualityCase.warehouse_id, client);
        if (disposition.post_idempotency_key) {
          if (disposition.post_idempotency_key !== idempotencyKey || disposition.post_request_hash !== requestHash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const posted = await client.query<{ movement_id: string }>(
            `SELECT movement_id FROM quality.quality_disposition_line
             WHERE quality_disposition_id = $1 ORDER BY id`, [id]
          );
          return { id, caseId: qualityCase.id, status: disposition.status, movementIds: posted.rows.map((line) => line.movement_id), replayed: true };
        }
        if (disposition.status !== 'APPROVED') throw new ConflictException(`QUALITY_DISPOSITION_STATE_CONFLICT:${disposition.status}`);
        if (disposition.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
        if (!disposition.approved_by || [disposition.requested_by, disposition.approved_by, qualityCase.reported_by].includes(actorId)) {
          throw new ConflictException('Poster must be independent from reporter, requester and approver');
        }
        const lines = await client.query<QualityLineRow & {
          disposition_line_id: string; destination_location_id: string | null; destination_status: string | null;
        }>(
          `SELECT case_line.id, case_line.line_number, case_line.balance_id, case_line.sku_id,
                  case_line.batch_id, case_line.source_location_id, case_line.source_status,
                  case_line.hold_location_id, case_line.hold_status, case_line.quantity,
                  case_line.hold_movement_id, disposition_line.id AS disposition_line_id,
                  disposition_line.destination_location_id, disposition_line.destination_status
           FROM quality.quality_disposition_line disposition_line
           JOIN quality.quality_case_line case_line ON case_line.id = disposition_line.quality_case_line_id
           WHERE disposition_line.quality_disposition_id = $1 ORDER BY case_line.line_number
           FOR UPDATE OF disposition_line, case_line`, [id]
        );
        if (lines.rows.length === 0) throw new ConflictException('Disposition has no lines');

        const movementIds: string[] = [];
        for (const line of lines.rows) {
          const current = await client.query<{ quantity_on_hand: string }>(
            `SELECT quantity_on_hand FROM inventory.inventory_balance
             WHERE sku_id = $1 AND batch_id = $2 AND warehouse_id = $3
               AND location_id = $4 AND stock_status = $5 FOR UPDATE`,
            [line.sku_id, line.batch_id, qualityCase.warehouse_id, line.hold_location_id, line.hold_status]
          );
          if (Number(current.rows[0]?.quantity_on_hand ?? 0) < Number(line.quantity)) {
            throw new ConflictException(`QUALITY_HELD_STOCK_INSUFFICIENT:${line.id}`);
          }
          const movementType = disposition.disposition_type === 'RETURN_TO_SUPPLIER' ? 'RETURN'
            : disposition.disposition_type === 'DESTROY' ? 'ISSUE' : 'STATUS_CHANGE';
          const movementId = await this.postMovement(client, {
            movementType, documentType: 'QUALITY_DISPOSITION', documentId: id,
            commandKey: `disposition:${line.id}`, skuId: line.sku_id, batchId: line.batch_id,
            quantity: Number(line.quantity), sourceWarehouseId: qualityCase.warehouse_id,
            sourceLocationId: line.hold_location_id, sourceStatus: line.hold_status,
            destinationWarehouseId: line.destination_location_id ? qualityCase.warehouse_id : null,
            destinationLocationId: line.destination_location_id, destinationStatus: line.destination_status,
            actorId, correlationId, reason: disposition.reason
          });
          movementIds.push(movementId);
          await client.query(
            `UPDATE quality.quality_disposition_line SET movement_id = $2 WHERE id = $1`,
            [line.disposition_line_id, movementId]
          );
        }
        const updated = await client.query<{ version: number }>(
          `UPDATE quality.quality_disposition
           SET status = 'POSTED', posted_by = $2, posted_at = now(), post_idempotency_key = $3,
               post_request_hash = $4, correlation_id = $5, version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, actorId, idempotencyKey, requestHash, correlationId]
        );
        const caseUpdate = await client.query<{ version: number }>(
          `UPDATE quality.quality_case SET status = 'CLOSED', version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [qualityCase.id]
        );
        if (qualityCase.origin_type === 'CUSTOMER_RETURN' && qualityCase.origin_id) {
          await client.query(
            `UPDATE quality.customer_return SET status = 'CLOSED', version = version + 1, updated_at = now()
             WHERE id = $1 AND status = 'POSTED'`, [qualityCase.origin_id]
          );
        }
        if (qualityCase.origin_type === 'RECALL_CASE' && qualityCase.origin_id) {
          await client.query(
            `UPDATE recall.recall_case recall_case
             SET status = 'CLOSED', version = version + 1, updated_at = now()
             WHERE recall_case.id = (
               SELECT scope.recall_case_id FROM recall.recall_scope scope WHERE scope.id = $1
             ) AND recall_case.status = 'CONTAINED'
             AND NOT EXISTS (
               SELECT 1 FROM recall.recall_scope scope
               JOIN quality.quality_case other_case
                 ON other_case.origin_type = 'RECALL_CASE' AND other_case.origin_id = scope.id
               WHERE scope.recall_case_id = recall_case.id AND other_case.status <> 'CLOSED'
             )`, [qualityCase.origin_id]
          );
        }
        await this.audit(client, actorId, 'POST', 'QUALITY_DISPOSITION', id, qualityCase.warehouse_id, correlationId, disposition.reason);
        await this.outbox(client, 'QUALITY_DISPOSITION', id, 'QUALITY_DISPOSITION_POSTED', correlationId, { qualityCaseId: qualityCase.id, movementIds });
        return {
          id, caseId: qualityCase.id, status: 'POSTED', version: updated.rows[0]?.version,
          caseVersion: caseUpdate.rows[0]?.version, movementIds, replayed: false
        };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async runExpiry(
    actorId: string,
    warehouseId: string,
    expiredLocationId: string,
    businessDate: string,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    await this.authorize(actorId, 'QUALITY.EXPIRY', warehouseId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new ConflictException('businessDate must be YYYY-MM-DD');
    const requestHash = hash({ warehouseId, expiredLocationId, businessDate });
    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; quality_case_id: string | null; expired_line_count: number }>(
          `SELECT id, request_hash, quality_case_id, expired_line_count FROM quality.expiry_run
           WHERE idempotency_key = $1 FOR UPDATE`, [idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, qualityCaseId: existing.quality_case_id, expiredLineCount: existing.expired_line_count, status: 'POSTED', replayed: true };
        }
        await this.assertLocation(client, expiredLocationId, warehouseId, 'QUARANTINE');
        const run = await client.query<{ id: string }>(
          `INSERT INTO quality.expiry_run (
             warehouse_id, expired_location_id, business_date, executed_by,
             idempotency_key, request_hash, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [warehouseId, expiredLocationId, businessDate, actorId, idempotencyKey, requestHash, correlationId]
        );
        const runId = run.rows[0]?.id;
        if (!runId) throw new Error('Expiry run insert did not return a row');
        const balances = await client.query<{
          id: string; sku_id: string; batch_id: string; location_id: string; stock_status: string; quantity_on_hand: string;
        }>(
          `SELECT balance.id, balance.sku_id, balance.batch_id, balance.location_id,
                  balance.stock_status, balance.quantity_on_hand
           FROM inventory.inventory_balance balance
           JOIN inventory.batch batch ON batch.id = balance.batch_id
           WHERE balance.warehouse_id = $1 AND balance.stock_status = 'AVAILABLE'
             AND balance.quantity_on_hand > 0 AND batch.expiration_date < $2::date
           ORDER BY balance.id FOR UPDATE OF balance`, [warehouseId, businessDate]
        );
        let qualityCaseId: string | null = null;
        if (balances.rows.length > 0) {
          const generatedCode = `EXP-${businessDate.replaceAll('-', '')}-${runId.slice(0, 8).toUpperCase()}`;
          const qualityCase = await client.query<{ id: string }>(
            `INSERT INTO quality.quality_case (
               case_code, case_type, warehouse_id, status, reason, origin_type, origin_id,
               reported_by, contained_by, contained_at, containment_idempotency_key,
               containment_request_hash, idempotency_key, request_hash
             ) VALUES ($1,'EXPIRY',$2,'CONTAINED',$3,'EXPIRY_RUN',$4,$5,$5,now(),$6,$7,$8,$7)
             RETURNING id`,
            [generatedCode, warehouseId, `Expired before ${businessDate}`, runId, actorId, `contain:${runId}`, requestHash, `case:${runId}`]
          );
          qualityCaseId = qualityCase.rows[0]?.id ?? null;
          if (!qualityCaseId) throw new Error('Expiry quality case insert did not return a row');
          for (const [index, balance] of balances.rows.entries()) {
            const movementId = await this.postMovement(client, {
              movementType: 'STATUS_CHANGE', documentType: 'EXPIRY_RUN', documentId: runId,
              commandKey: `expiry:${balance.id}`, skuId: balance.sku_id, batchId: balance.batch_id,
              quantity: Number(balance.quantity_on_hand), sourceWarehouseId: warehouseId,
              sourceLocationId: balance.location_id, sourceStatus: balance.stock_status,
              destinationWarehouseId: warehouseId, destinationLocationId: expiredLocationId,
              destinationStatus: 'EXPIRED', actorId, correlationId, reason: `Expired before ${businessDate}`
            });
            await client.query(
              `INSERT INTO quality.quality_case_line (
                 quality_case_id, line_number, balance_id, sku_id, batch_id, source_location_id,
                 source_status, hold_location_id, hold_status, quantity, hold_movement_id
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EXPIRED',$9,$10)`,
              [
                qualityCaseId, index + 1, balance.id, balance.sku_id, balance.batch_id,
                balance.location_id, balance.stock_status, expiredLocationId,
                Number(balance.quantity_on_hand), movementId
              ]
            );
          }
          await client.query(
            `UPDATE quality.expiry_run SET expired_line_count = $2, quality_case_id = $3 WHERE id = $1`,
            [runId, balances.rows.length, qualityCaseId]
          );
        }
        await this.audit(client, actorId, 'RUN_EXPIRY', 'EXPIRY_RUN', runId, warehouseId, correlationId, `Business date ${businessDate}`);
        await this.outbox(client, 'EXPIRY_RUN', runId, 'EXPIRY_RUN_POSTED', correlationId, { qualityCaseId, expiredLineCount: balances.rows.length });
        return { id: runId, qualityCaseId, expiredLineCount: balances.rows.length, status: 'POSTED', replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async cancelCase(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('Cancellation reason is required');
    return this.db.transaction(async (client) => {
      const qualityCase = await this.lockCase(client, id);
      await this.authorize(actorId, 'QUALITY.CREATE', qualityCase.warehouse_id, client);
      if (qualityCase.status === 'CANCELLED') return { id, status: 'CANCELLED', version: qualityCase.version, replayed: true };
      this.assertStateVersion(qualityCase, 'DRAFT', expectedVersion);
      const updated = await client.query<{ version: number }>(
        `UPDATE quality.quality_case SET status = 'CANCELLED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CANCEL', 'QUALITY_CASE', id, qualityCase.warehouse_id, correlationId, reason.trim());
      return { id, status: 'CANCELLED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  private async lockCase(client: PoolClient, id: string): Promise<QualityCaseRow> {
    const result = await client.query<QualityCaseRow>(
      `SELECT id, case_code, case_type, warehouse_id, status, reason, origin_type, origin_id,
              reported_by, contained_by, containment_idempotency_key, containment_request_hash,
              version, created_at, updated_at
       FROM quality.quality_case WHERE id = $1 FOR UPDATE`, [id]
    );
    const qualityCase = result.rows[0];
    if (!qualityCase) throw new NotFoundException('Quality case not found');
    return qualityCase;
  }

  private async lockLines(client: PoolClient, caseId: string): Promise<QualityLineRow[]> {
    const result = await client.query<QualityLineRow>(
      `SELECT id, line_number, balance_id, sku_id, batch_id, source_location_id, source_status,
              hold_location_id, hold_status, quantity, hold_movement_id
       FROM quality.quality_case_line WHERE quality_case_id = $1 ORDER BY line_number FOR UPDATE`, [caseId]
    );
    if (result.rows.length === 0) throw new ConflictException('Quality case has no lines');
    return result.rows;
  }

  private async lockDisposition(client: PoolClient, id: string): Promise<DispositionRow> {
    const result = await client.query<DispositionRow>(
      `SELECT id, disposition_code, quality_case_id, disposition_type, status, reason,
              requested_by, approved_by, post_idempotency_key, post_request_hash, version
       FROM quality.quality_disposition WHERE id = $1 FOR UPDATE`, [id]
    );
    const disposition = result.rows[0];
    if (!disposition) throw new NotFoundException('Quality disposition not found');
    return disposition;
  }

  private assertStateVersion(qualityCase: QualityCaseRow, status: string, expectedVersion: number): void {
    if (qualityCase.status !== status) throw new ConflictException(`QUALITY_STATE_CONFLICT:${qualityCase.status}`);
    if (qualityCase.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private async assertLocation(client: PoolClient, id: string, warehouseId: string, zoneType?: string): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM warehouse.location location
       JOIN warehouse.zone zone ON zone.id = location.zone_id
       WHERE location.id = $1 AND zone.warehouse_id = $2 AND location.status = 'ACTIVE'
         AND ($3::text IS NULL OR zone.zone_type = $3)`, [id, warehouseId, zoneType ?? null]
    );
    if (result.rowCount !== 1) throw new ConflictException('Active destination location does not belong to warehouse or required zone');
  }

  private async postMovement(client: PoolClient, input: {
    movementType: string; documentType: string; documentId: string; commandKey: string;
    skuId: string; batchId: string; quantity: number;
    sourceWarehouseId: string | null; sourceLocationId: string | null; sourceStatus: string | null;
    destinationWarehouseId: string | null; destinationLocationId: string | null; destinationStatus: string | null;
    actorId: string; correlationId: string; reason: string;
  }): Promise<string> {
    const result = await client.query<{ id: string }>(
      `SELECT inventory.post_movement(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
       ) id`,
      [
        input.movementType, input.documentType, input.documentId, input.commandKey,
        input.skuId, input.batchId, input.quantity,
        input.sourceWarehouseId, input.sourceLocationId, input.sourceStatus,
        input.destinationWarehouseId, input.destinationLocationId, input.destinationStatus,
        input.actorId, input.correlationId, input.reason
      ]
    );
    const movementId = result.rows[0]?.id;
    if (!movementId) throw new Error('Inventory Core did not return quality movement');
    return movementId;
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
    const message = error instanceof Error ? error.message : 'Quality command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Quality code, active workflow or idempotency key already exists');
    }
    if (message.includes('INVENTORY_') || message.includes('QUALITY_') || message.includes('RECALL_')) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
