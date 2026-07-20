import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { StocktakeDatabaseService } from './stocktake-database.service.js';

export interface CreateStocktakeInput {
  sessionCode: string;
  warehouseId: string;
  zoneId?: string;
  locationId?: string;
  skuId?: string;
  blindCount?: boolean;
  recountThreshold?: number;
}

interface StocktakeRow {
  id: string;
  session_code: string;
  warehouse_id: string;
  zone_id: string | null;
  location_id: string | null;
  sku_id: string | null;
  blind_count: boolean;
  recount_threshold: string;
  status: string;
  current_round: number;
  created_by: string;
  approved_by: string | null;
  posted_by: string | null;
  idempotency_key: string;
  request_hash: string;
  version: number;
  created_at: string;
  started_at: string | null;
  updated_at: string;
}

interface SnapshotRow {
  id: string;
  balance_id: string;
  sku_id: string;
  batch_id: string;
  location_id: string;
  stock_status: string;
  system_quantity: string;
  balance_version: string;
}

interface AdjustmentLineRow extends SnapshotRow {
  line_id: string;
  counted_quantity: string;
  variance_quantity: string;
}

function commandHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeCode(value: string, name: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException(`${name} is required`);
  return normalized;
}

function nonNegativeWholeCase(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConflictException(`${name} must be a non-negative whole case quantity`);
  }
  return value;
}

@Injectable()
export class StocktakeService {
  constructor(private readonly db: StocktakeDatabaseService) {}

  async listSessions(actorId: string, warehouseId: string) {
    if (!await this.db.hasAccess(actorId, 'STOCKTAKE.VIEW', warehouseId)) {
      throw new ForbiddenException('Permission or warehouse scope denied');
    }
    return this.db.query(`
      SELECT id, session_code, status, blind_count, recount_threshold, current_round, created_at
      FROM stocktake.stocktake_session
      WHERE warehouse_id = $1
      ORDER BY created_at DESC
    `, [warehouseId]);
  }

  async createSession(actorId: string, input: CreateStocktakeInput, idempotencyKey: string, correlationId: string) {
    this.validateKey(idempotencyKey);
    await this.authorize(actorId, 'STOCKTAKE.CREATE', input.warehouseId);
    const sessionCode = normalizeCode(input.sessionCode, 'Session code');
    const recountThreshold = nonNegativeWholeCase(input.recountThreshold ?? 0, 'recountThreshold');
    if (input.zoneId && input.locationId) throw new ConflictException('Choose either zoneId or locationId, not both');
    const hash = commandHash({
      sessionCode,
      warehouseId: input.warehouseId,
      zoneId: input.zoneId ?? null,
      locationId: input.locationId ?? null,
      skuId: input.skuId ?? null,
      blindCount: input.blindCount ?? true,
      recountThreshold
    });

    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, request_hash, status, version
           FROM stocktake.stocktake_session
           WHERE created_by = $1 AND idempotency_key = $2 FOR UPDATE`,
          [actorId, idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
        }

        const warehouse = await client.query(
          `SELECT 1 FROM warehouse.warehouse WHERE id = $1 AND status = 'ACTIVE'`, [input.warehouseId]
        );
        if (warehouse.rowCount !== 1) throw new NotFoundException('Active warehouse not found');
        if (input.zoneId) {
          const zone = await client.query(
            `SELECT 1 FROM warehouse.zone WHERE id = $1 AND warehouse_id = $2 AND status = 'ACTIVE'`,
            [input.zoneId, input.warehouseId]
          );
          if (zone.rowCount !== 1) throw new NotFoundException('Active zone in warehouse not found');
        }
        if (input.locationId) {
          const location = await client.query(
            `SELECT 1 FROM warehouse.location location
             JOIN warehouse.zone zone ON zone.id = location.zone_id
             WHERE location.id = $1 AND zone.warehouse_id = $2 AND location.status = 'ACTIVE'`,
            [input.locationId, input.warehouseId]
          );
          if (location.rowCount !== 1) throw new NotFoundException('Active location in warehouse not found');
        }
        if (input.skuId) {
          const sku = await client.query(`SELECT 1 FROM catalog.sku WHERE id = $1 AND status = 'ACTIVE'`, [input.skuId]);
          if (sku.rowCount !== 1) throw new NotFoundException('Active SKU not found');
        }

        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO stocktake.stocktake_session (
             session_code, warehouse_id, zone_id, location_id, sku_id, blind_count,
             recount_threshold, created_by, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, version`,
          [
            sessionCode, input.warehouseId, input.zoneId ?? null, input.locationId ?? null,
            input.skuId ?? null, input.blindCount ?? true, recountThreshold, actorId, idempotencyKey, hash
          ]
        );
        const session = inserted.rows[0];
        if (!session) throw new Error('Stocktake insert did not return a row');
        await this.audit(client, actorId, 'CREATE', 'STOCKTAKE_SESSION', session.id, input.warehouseId, correlationId, null);
        return { id: session.id, sessionCode, status: 'PLANNED', version: session.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async findSession(actorId: string, id: string) {
    const sessions = await this.db.query<StocktakeRow>(
      `SELECT id, session_code, warehouse_id, zone_id, location_id, sku_id, blind_count,
              recount_threshold, status, current_round, created_by, approved_by, posted_by,
              idempotency_key, request_hash, version, created_at, started_at, updated_at
       FROM stocktake.stocktake_session WHERE id = $1`, [id]
    );
    const session = sessions[0];
    if (!session) throw new NotFoundException('Stocktake session not found');
    await this.authorize(actorId, 'STOCKTAKE.VIEW', session.warehouse_id);
    const hideSystem = session.blind_count && ['COUNTING', 'RECOUNT'].includes(session.status);
    const snapshots = await this.db.query<SnapshotRow & { round_number: number | null; counted_quantity: string | null; counted_by: string | null }>(
      `SELECT snapshot.id, snapshot.balance_id, snapshot.sku_id, snapshot.batch_id,
              snapshot.location_id, snapshot.stock_status, snapshot.system_quantity,
              snapshot.balance_version, count.round_number, count.counted_quantity, count.counted_by
       FROM stocktake.stocktake_snapshot_line snapshot
       LEFT JOIN LATERAL (
         SELECT round_number, counted_quantity, counted_by
         FROM stocktake.stocktake_count_entry entry
         WHERE entry.snapshot_line_id = snapshot.id
         ORDER BY round_number DESC LIMIT 1
       ) count ON true
       WHERE snapshot.stocktake_session_id = $1
       ORDER BY snapshot.location_id, snapshot.sku_id, snapshot.batch_id, snapshot.stock_status`, [id]
    );
    const adjustment = await this.db.query(
      `SELECT id, adjustment_code, status, reason, approved_by, posted_by, version, created_at, updated_at
       FROM adjustment.inventory_adjustment WHERE stocktake_session_id = $1`, [id]
    );
    return {
      ...session,
      recount_threshold: Number(session.recount_threshold),
      snapshots: snapshots.map((row) => ({
        ...row,
        system_quantity: hideSystem ? undefined : Number(row.system_quantity),
        balance_version: Number(row.balance_version),
        counted_quantity: row.counted_quantity === null ? null : Number(row.counted_quantity)
      })),
      adjustment: adjustment[0] ?? null
    };
  }

  async startSession(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    try {
      return await this.db.transaction(async (client) => {
        const session = await this.lockSession(client, id);
        await this.authorize(actorId, 'STOCKTAKE.CREATE', session.warehouse_id, client);
        if (session.status === 'COUNTING') return { id, status: session.status, round: 1, version: session.version, replayed: true };
        this.assertStateVersion(session, 'PLANNED', expectedVersion);

        const locations = await client.query<{ id: string; status: string }>(
          `SELECT location.id, location.status
           FROM warehouse.location location
           JOIN warehouse.zone zone ON zone.id = location.zone_id
           WHERE zone.warehouse_id = $1
             AND ($2::uuid IS NULL OR zone.id = $2)
             AND ($3::uuid IS NULL OR location.id = $3)
             AND location.status <> 'INACTIVE'
           ORDER BY location.id FOR UPDATE OF location`,
          [session.warehouse_id, session.zone_id, session.location_id]
        );
        if (locations.rows.length === 0) throw new ConflictException('Stocktake scope has no active location');
        const unavailable = locations.rows.find((location) => location.status !== 'ACTIVE');
        if (unavailable) throw new ConflictException(`Location ${unavailable.id} is not ACTIVE`);

        for (const location of locations.rows) {
          await client.query(
            `INSERT INTO stocktake.stocktake_session_location (stocktake_session_id, location_id, previous_status)
             VALUES ($1,$2,$3)`, [id, location.id, location.status]
          );
        }
        await client.query(
          `UPDATE warehouse.location SET status = 'STOCKTAKE', version = version + 1
           WHERE id = ANY($1::uuid[])`, [locations.rows.map((location) => location.id)]
        );

        const snapshot = await client.query(
          `INSERT INTO stocktake.stocktake_snapshot_line (
             stocktake_session_id, balance_id, sku_id, batch_id, location_id,
             stock_status, system_quantity, balance_version
           )
           SELECT $1, balance.id, balance.sku_id, balance.batch_id, balance.location_id,
                  balance.stock_status, balance.quantity_on_hand, balance.version
           FROM inventory.inventory_balance balance
           WHERE balance.warehouse_id = $2
             AND balance.location_id = ANY($3::uuid[])
             AND ($4::uuid IS NULL OR balance.sku_id = $4)
           ORDER BY balance.id`,
          [id, session.warehouse_id, locations.rows.map((location) => location.id), session.sku_id]
        );
        if (snapshot.rowCount === 0) throw new ConflictException('Stocktake scope has no inventory balance to count');

        const updated = await client.query<{ version: number }>(
          `UPDATE stocktake.stocktake_session
           SET status = 'COUNTING', current_round = 1, started_at = now(), version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id]
        );
        await this.audit(client, actorId, 'START', 'STOCKTAKE_SESSION', id, session.warehouse_id, correlationId, null);
        await this.outbox(client, 'STOCKTAKE_SESSION', id, 'STOCKTAKE_COUNTING_STARTED', correlationId, {
          locationCount: locations.rows.length,
          snapshotLineCount: snapshot.rowCount
        });
        return { id, status: 'COUNTING', round: 1, version: updated.rows[0]?.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async recordCount(
    actorId: string,
    id: string,
    snapshotLineId: string,
    countedQuantity: number,
    evidenceReference: string | undefined,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const quantity = nonNegativeWholeCase(countedQuantity, 'countedQuantity');
    const evidence = evidenceReference?.trim() || null;
    const hash = commandHash({ id, snapshotLineId, countedQuantity: quantity, evidenceReference: evidence, expectedVersion });
    try {
      return await this.db.transaction(async (client) => {
        const replay = await client.query<{ id: string; request_hash: string; round_number: number }>(
          `SELECT id, request_hash, round_number FROM stocktake.stocktake_count_entry
           WHERE idempotency_key = $1 FOR UPDATE`, [idempotencyKey]
        );
        const existing = replay.rows[0];
        if (existing) {
          if (existing.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: existing.id, sessionId: id, round: existing.round_number, replayed: true };
        }
        const session = await this.lockSession(client, id);
        await this.authorize(actorId, 'STOCKTAKE.COUNT', session.warehouse_id, client);
        if (!['COUNTING', 'RECOUNT'].includes(session.status)) throw new ConflictException(`STOCKTAKE_STATE_CONFLICT:${session.status}`);
        if (session.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
        const snapshot = await client.query(
          `SELECT 1 FROM stocktake.stocktake_snapshot_line
           WHERE id = $1 AND stocktake_session_id = $2`, [snapshotLineId, id]
        );
        if (snapshot.rowCount !== 1) throw new NotFoundException('Snapshot line not found in stocktake session');
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO stocktake.stocktake_count_entry (
             stocktake_session_id, snapshot_line_id, round_number, counted_quantity,
             counted_by, evidence_reference, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [id, snapshotLineId, session.current_round, quantity, actorId, evidence, idempotencyKey, hash]
        );
        const entryId = inserted.rows[0]?.id;
        if (!entryId) throw new Error('Stocktake count insert did not return a row');
        await this.audit(client, actorId, 'COUNT', 'STOCKTAKE_COUNT_ENTRY', entryId, session.warehouse_id, correlationId, null);
        return { id: entryId, sessionId: id, round: session.current_round, countedQuantity: quantity, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async completeRound(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    try {
      return await this.db.transaction(async (client) => {
        const session = await this.lockSession(client, id);
        await this.authorize(actorId, 'STOCKTAKE.RECONCILE', session.warehouse_id, client);
        if (!['COUNTING', 'RECOUNT'].includes(session.status)) throw new ConflictException(`STOCKTAKE_STATE_CONFLICT:${session.status}`);
        if (session.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
        const completeness = await client.query<{ total: string; counted: string; outside_threshold: string }>(
          `SELECT count(*)::text AS total,
                  count(entry.id)::text AS counted,
                  count(*) FILTER (
                    WHERE entry.id IS NOT NULL
                      AND abs(entry.counted_quantity - snapshot.system_quantity) > $3
                  )::text AS outside_threshold
           FROM stocktake.stocktake_snapshot_line snapshot
           LEFT JOIN stocktake.stocktake_count_entry entry
             ON entry.snapshot_line_id = snapshot.id AND entry.round_number = $2
           WHERE snapshot.stocktake_session_id = $1`,
          [id, session.current_round, Number(session.recount_threshold)]
        );
        const totals = completeness.rows[0];
        if (!totals || Number(totals.counted) !== Number(totals.total)) {
          throw new ConflictException('Every snapshot line must be counted before completing the round');
        }
        const needsRecount = session.current_round === 1 && Number(totals.outside_threshold) > 0;
        const status = needsRecount ? 'RECOUNT' : 'RECONCILED';
        const round = needsRecount ? 2 : session.current_round;
        const updated = await client.query<{ version: number }>(
          `UPDATE stocktake.stocktake_session
           SET status = $2, current_round = $3, version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, status, round]
        );
        await this.audit(client, actorId, 'COMPLETE_ROUND', 'STOCKTAKE_SESSION', id, session.warehouse_id, correlationId, null);
        await this.outbox(client, 'STOCKTAKE_SESSION', id,
          needsRecount ? 'STOCKTAKE_RECOUNT_REQUIRED' : 'STOCKTAKE_RECONCILED', correlationId,
          { completedRound: session.current_round, nextRound: needsRecount ? 2 : null });
        return { id, status, round, version: updated.rows[0]?.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async requestApproval(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const session = await this.lockSession(client, id);
      await this.authorize(actorId, 'STOCKTAKE.RECONCILE', session.warehouse_id, client);
      if (session.status === 'PENDING_APPROVAL') {
        return { id, status: session.status, version: session.version, replayed: true };
      }
      this.assertStateVersion(session, 'RECONCILED', expectedVersion);
      const updated = await client.query<{ version: number }>(
        `UPDATE stocktake.stocktake_session
         SET status = 'PENDING_APPROVAL', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'REQUEST_APPROVAL', 'STOCKTAKE_SESSION', id, session.warehouse_id, correlationId, null);
      return { id, status: 'PENDING_APPROVAL', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async approveSession(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    const approvalReason = reason.trim();
    if (!approvalReason) throw new ConflictException('Approval reason is required');
    try {
      return await this.db.transaction(async (client) => {
        const session = await this.lockSession(client, id);
        await this.authorize(actorId, 'STOCKTAKE.APPROVE', session.warehouse_id, client);
        if (session.approved_by) {
          if (session.approved_by !== actorId) throw new ConflictException('Stocktake has already been approved');
          const prior = await client.query<{ id: string; status: string; version: number }>(
            `SELECT id, status, version FROM adjustment.inventory_adjustment WHERE stocktake_session_id = $1`, [id]
          );
          return { id, adjustmentId: prior.rows[0]?.id, status: session.status, version: session.version, replayed: true };
        }
        this.assertStateVersion(session, 'PENDING_APPROVAL', expectedVersion);
        if (session.created_by === actorId) throw new ConflictException('Creator cannot approve the same stocktake');
        const ownCounts = await client.query(
          `SELECT 1 FROM stocktake.stocktake_count_entry
           WHERE stocktake_session_id = $1 AND counted_by = $2 LIMIT 1`, [id, actorId]
        );
        if (ownCounts.rowCount) throw new ConflictException('Counter cannot approve the same stocktake');

        const adjustment = await client.query<{ id: string; version: number }>(
          `INSERT INTO adjustment.inventory_adjustment (
             adjustment_code, stocktake_session_id, warehouse_id, reason, approved_by
           ) VALUES ($1,$2,$3,$4,$5) RETURNING id, version`,
          [`ADJ-${session.session_code}`, id, session.warehouse_id, approvalReason, actorId]
        );
        const adjustmentId = adjustment.rows[0]?.id;
        if (!adjustmentId) throw new Error('Inventory adjustment insert did not return a row');
        await client.query(
          `INSERT INTO adjustment.inventory_adjustment_line (
             inventory_adjustment_id, snapshot_line_id, sku_id, batch_id, location_id,
             stock_status, system_quantity, counted_quantity, variance_quantity
           )
           SELECT $1, snapshot.id, snapshot.sku_id, snapshot.batch_id, snapshot.location_id,
                  snapshot.stock_status, snapshot.system_quantity, latest.counted_quantity,
                  latest.counted_quantity - snapshot.system_quantity
           FROM stocktake.stocktake_snapshot_line snapshot
           JOIN LATERAL (
             SELECT counted_quantity FROM stocktake.stocktake_count_entry entry
             WHERE entry.snapshot_line_id = snapshot.id
             ORDER BY round_number DESC LIMIT 1
           ) latest ON true
           WHERE snapshot.stocktake_session_id = $2
             AND latest.counted_quantity <> snapshot.system_quantity`, [adjustmentId, id]
        );
        const updated = await client.query<{ version: number }>(
          `UPDATE stocktake.stocktake_session
           SET approved_by = $2, approved_at = now(), version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, actorId]
        );
        await this.audit(client, actorId, 'APPROVE', 'INVENTORY_ADJUSTMENT', adjustmentId, session.warehouse_id, correlationId, approvalReason);
        await this.outbox(client, 'INVENTORY_ADJUSTMENT', adjustmentId, 'INVENTORY_ADJUSTMENT_APPROVED', correlationId, { stocktakeSessionId: id });
        return {
          id,
          adjustmentId,
          adjustmentStatus: 'APPROVED',
          status: 'PENDING_APPROVAL',
          version: updated.rows[0]?.version,
          replayed: false
        };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async postAdjustment(
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
        const session = await this.lockSession(client, id);
        await this.authorize(actorId, 'ADJUSTMENT.POST', session.warehouse_id, client);
        const adjustmentResult = await client.query<{
          id: string; status: string; approved_by: string; idempotency_key: string | null; request_hash: string | null; version: number;
        }>(
          `SELECT id, status, approved_by, idempotency_key, request_hash, version
           FROM adjustment.inventory_adjustment WHERE stocktake_session_id = $1 FOR UPDATE`, [id]
        );
        const adjustment = adjustmentResult.rows[0];
        if (!adjustment) throw new ConflictException('Stocktake must be approved before adjustment posting');
        if (adjustment.idempotency_key) {
          if (adjustment.idempotency_key !== idempotencyKey || adjustment.request_hash !== hash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          return { id, adjustmentId: adjustment.id, status: session.status, version: session.version, replayed: true };
        }
        this.assertStateVersion(session, 'PENDING_APPROVAL', expectedVersion);
        if (!session.approved_by || adjustment.status !== 'APPROVED') throw new ConflictException('Approved adjustment not found');
        if (session.approved_by === actorId || session.created_by === actorId) {
          throw new ConflictException('Poster must be independent from stocktake creator and approver');
        }
        const ownCounts = await client.query(
          `SELECT 1 FROM stocktake.stocktake_count_entry
           WHERE stocktake_session_id = $1 AND counted_by = $2 LIMIT 1`, [id, actorId]
        );
        if (ownCounts.rowCount) throw new ConflictException('Counter cannot post the same stocktake adjustment');

        const lines = await client.query<AdjustmentLineRow>(
          `SELECT line.id AS line_id, snapshot.id, snapshot.balance_id, line.sku_id, line.batch_id,
                  line.location_id, line.stock_status, line.system_quantity, line.counted_quantity,
                  line.variance_quantity, snapshot.balance_version
           FROM adjustment.inventory_adjustment_line line
           JOIN stocktake.stocktake_snapshot_line snapshot ON snapshot.id = line.snapshot_line_id
           WHERE line.inventory_adjustment_id = $1 ORDER BY line.id FOR UPDATE OF line`, [adjustment.id]
        );

        for (const line of lines.rows) {
          const current = await client.query<{ quantity_on_hand: string; version: string }>(
            `SELECT quantity_on_hand, version FROM inventory.inventory_balance WHERE id = $1 FOR UPDATE`, [line.balance_id]
          );
          const balance = current.rows[0];
          if (!balance || balance.quantity_on_hand !== line.system_quantity || balance.version !== line.balance_version) {
            throw new ConflictException(`STOCKTAKE_SNAPSHOT_STALE:${line.id}`);
          }
        }

        const movementIds: string[] = [];
        for (const line of lines.rows) {
          const variance = Number(line.variance_quantity);
          const movement = await client.query<{ id: string }>(
            `SELECT inventory.post_movement(
               'ADJUSTMENT','INVENTORY_ADJUSTMENT',$1,$2,$3,$4,$5,
               $6,$7,$8,$9,$10,$11,$12,$13,$14
             ) id`,
            variance < 0
              ? [
                  adjustment.id, `adjustment:${line.line_id}`, line.sku_id, line.batch_id, Math.abs(variance),
                  session.warehouse_id, line.location_id, line.stock_status,
                  null, null, null, actorId, correlationId, 'Approved stocktake negative variance'
                ]
              : [
                  adjustment.id, `adjustment:${line.line_id}`, line.sku_id, line.batch_id, variance,
                  null, null, null,
                  session.warehouse_id, line.location_id, line.stock_status,
                  actorId, correlationId, 'Approved stocktake positive variance'
                ]
          );
          const movementId = movement.rows[0]?.id;
          if (!movementId) throw new Error('Inventory Core did not return adjustment movement');
          movementIds.push(movementId);
          await client.query(
            `UPDATE adjustment.inventory_adjustment_line SET movement_id = $2 WHERE id = $1`, [line.line_id, movementId]
          );
        }

        await client.query(
          `UPDATE adjustment.inventory_adjustment
           SET status = 'POSTED', posted_by = $2, posted_at = now(), idempotency_key = $3,
               request_hash = $4, correlation_id = $5, version = version + 1, updated_at = now()
           WHERE id = $1`, [adjustment.id, actorId, idempotencyKey, hash, correlationId]
        );
        const updated = await client.query<{ version: number }>(
          `UPDATE stocktake.stocktake_session
           SET status = 'POSTED', posted_by = $2, posted_at = now(), version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, actorId]
        );
        await this.unlockLocations(client, id);
        await this.audit(client, actorId, 'POST', 'INVENTORY_ADJUSTMENT', adjustment.id, session.warehouse_id, correlationId, null);
        await this.outbox(client, 'INVENTORY_ADJUSTMENT', adjustment.id, 'INVENTORY_ADJUSTMENT_POSTED', correlationId, { stocktakeSessionId: id, movementIds });
        return {
          id,
          adjustmentId: adjustment.id,
          movementIds,
          status: 'POSTED',
          version: updated.rows[0]?.version,
          replayed: false
        };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async cancelSession(actorId: string, id: string, expectedVersion: number, reason: string, correlationId: string) {
    const cancellationReason = reason.trim();
    if (!cancellationReason) throw new ConflictException('Cancellation reason is required');
    return this.db.transaction(async (client) => {
      const session = await this.lockSession(client, id);
      await this.authorize(actorId, 'STOCKTAKE.CREATE', session.warehouse_id, client);
      if (session.status === 'CANCELLED') return { id, status: 'CANCELLED', version: session.version, replayed: true };
      if (session.status === 'POSTED') throw new ConflictException('Posted stocktake must be reversed, not cancelled');
      if (session.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
      if (session.approved_by) throw new ConflictException('Approved stocktake adjustment must be posted or separately reversed');
      const updated = await client.query<{ version: number }>(
        `UPDATE stocktake.stocktake_session
         SET status = 'CANCELLED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.unlockLocations(client, id);
      await this.audit(client, actorId, 'CANCEL', 'STOCKTAKE_SESSION', id, session.warehouse_id, correlationId, cancellationReason);
      return { id, status: 'CANCELLED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  private async unlockLocations(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
      `UPDATE warehouse.location location
       SET status = scope.previous_status, version = location.version + 1
       FROM stocktake.stocktake_session_location scope
       WHERE scope.stocktake_session_id = $1 AND scope.location_id = location.id
         AND location.status = 'STOCKTAKE'`, [sessionId]
    );
  }

  private async lockSession(client: PoolClient, id: string): Promise<StocktakeRow> {
    const result = await client.query<StocktakeRow>(
      `SELECT id, session_code, warehouse_id, zone_id, location_id, sku_id, blind_count,
              recount_threshold, status, current_round, created_by, approved_by, posted_by,
              idempotency_key, request_hash, version, created_at, started_at, updated_at
       FROM stocktake.stocktake_session WHERE id = $1 FOR UPDATE`, [id]
    );
    const session = result.rows[0];
    if (!session) throw new NotFoundException('Stocktake session not found');
    return session;
  }

  private assertStateVersion(session: StocktakeRow, status: string, expectedVersion: number): void {
    if (session.status !== status) throw new ConflictException(`STOCKTAKE_STATE_CONFLICT:${session.status}`);
    if (session.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private async authorize(actorId: string, permission: string, warehouseId: string, client?: PoolClient): Promise<void> {
    if (!await this.db.hasAccess(actorId, permission, warehouseId, client)) {
      throw new ForbiddenException('Permission or warehouse scope denied');
    }
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
    warehouseId: string,
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
    const message = error instanceof Error ? error.message : 'Stocktake command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Stocktake code, count round or idempotency key already exists');
    }
    if (message.includes('INVENTORY_') || message.includes('STOCKTAKE_')) throw new ConflictException(message);
    throw error;
  }
}
