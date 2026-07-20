import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TransferDatabaseService } from './transfer-database.service.js';

export interface CreateTransferLineInput {
  skuId: string;
  batchId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  quantity: number;
}

export interface CreateTransferInput {
  transferCode: string;
  transferType: 'LOCATION' | 'WAREHOUSE';
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  transitWarehouseId?: string;
  transitLocationId?: string;
  lines: readonly CreateTransferLineInput[];
}

export interface ReceiveTransferLineInput {
  transferLineId: string;
  destinationLocationId: string;
  damagedLocationId?: string;
  receivedQuantity?: number;
  damagedQuantity?: number;
  missingQuantity?: number;
  reason?: string;
}

interface TransferRow {
  id: string;
  transfer_code: string;
  transfer_type: 'LOCATION' | 'WAREHOUSE';
  source_warehouse_id: string;
  destination_warehouse_id: string;
  transit_warehouse_id: string | null;
  transit_location_id: string | null;
  status: string;
  requested_by: string;
  approved_by: string | null;
  idempotency_key: string;
  request_hash: string;
  dispatch_idempotency_key: string | null;
  dispatch_request_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TransferLineRow {
  id: string;
  line_number: number;
  sku_id: string;
  batch_id: string;
  source_location_id: string;
  destination_location_id: string;
  planned_quantity: string;
  picked_quantity: string;
  dispatched_quantity: string;
  received_quantity: string;
  damaged_quantity: string;
  lost_quantity: string;
}

function normalizeCode(value: string, name: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException(`${name} is required`);
  return normalized;
}

function wholeCase(value: number, name = 'quantity'): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConflictException(`${name} must be a positive whole case quantity`);
  }
  return value;
}

function nonnegativeWholeCase(value: number | undefined, name: string): number {
  const normalized = value ?? 0;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new ConflictException(`${name} must be a non-negative whole case quantity`);
  }
  return normalized;
}

function hashCommand(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class TransferService {
  constructor(private readonly db: TransferDatabaseService) {}

  async listTransfers(actorId: string, warehouseId: string) {
    if (!await this.db.hasAccess(actorId, 'INVENTORY.VIEW', warehouseId)) {
      throw new ForbiddenException('Permission or warehouse scope denied');
    }
    return this.db.query(`
      SELECT st.id, st.transfer_code, st.transfer_type, st.status, st.version, st.created_at,
             w_src.name AS source_warehouse_name, w_dest.name AS destination_warehouse_name,
             coalesce((SELECT sum(planned_quantity) FROM transfer.stock_transfer_line WHERE stock_transfer_id = st.id), 0)::int as total_qty
      FROM transfer.stock_transfer st
      JOIN warehouse.warehouse w_src ON w_src.id = st.source_warehouse_id
      JOIN warehouse.warehouse w_dest ON w_dest.id = st.destination_warehouse_id
      WHERE st.source_warehouse_id = $1 OR st.destination_warehouse_id = $1
      ORDER BY st.created_at DESC
    `, [warehouseId]);
  }

  async createTransfer(
    actorId: string,
    input: CreateTransferInput,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const transferCode = normalizeCode(input.transferCode, 'Transfer code');
    if (!['LOCATION', 'WAREHOUSE'].includes(input.transferType)) throw new ConflictException('Unsupported transfer type');
    if (input.lines.length === 0) throw new ConflictException('Transfer must have at least one line');
    if (input.transferType === 'LOCATION') {
      if (input.sourceWarehouseId !== input.destinationWarehouseId) {
        throw new ConflictException('Location transfer must remain in one warehouse');
      }
      if (input.transitWarehouseId || input.transitLocationId) {
        throw new ConflictException('Location transfer must not use transit stock');
      }
    } else if (
      input.sourceWarehouseId === input.destinationWarehouseId
      || !input.transitWarehouseId
      || !input.transitLocationId
    ) {
      throw new ConflictException('Warehouse transfer requires distinct warehouses and a transit location');
    }
    const normalizedLines = input.lines.map((line) => ({ ...line, quantity: wholeCase(line.quantity) }));
    const hash = hashCommand({ ...input, transferCode, lines: normalizedLines });
    await this.authorizeWarehouses(actorId, 'TRANSFER.CREATE', [
      input.sourceWarehouseId,
      input.destinationWarehouseId,
      input.transitWarehouseId
    ]);

    try {
      return await this.db.transaction(async (client) => {
        const replayRows = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
          `SELECT id, request_hash, status, version FROM transfer.stock_transfer
           WHERE requested_by = $1 AND idempotency_key = $2 FOR UPDATE`, [actorId, idempotencyKey]
        );
        const replay = replayRows.rows[0];
        if (replay) {
          if (replay.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return { id: replay.id, status: replay.status, version: replay.version, replayed: true };
        }

        if (input.transferType === 'WAREHOUSE') {
          const transit = await client.query(
            `SELECT 1 FROM warehouse.location location
             JOIN warehouse.zone zone ON zone.id = location.zone_id
             JOIN warehouse.warehouse warehouse ON warehouse.id = zone.warehouse_id
             WHERE location.id = $1 AND warehouse.id = $2
               AND warehouse.warehouse_type = 'TRANSIT' AND location.status = 'ACTIVE'`,
            [input.transitLocationId, input.transitWarehouseId]
          );
          if (transit.rowCount !== 1) throw new ConflictException('Active transit location must belong to a TRANSIT warehouse');
        }

        for (const line of normalizedLines) {
          if (line.sourceLocationId === line.destinationLocationId) {
            throw new ConflictException('Transfer source and destination locations must differ');
          }
          await this.assertLocation(client, line.sourceLocationId, input.sourceWarehouseId, 'source');
          await this.assertLocation(client, line.destinationLocationId, input.destinationWarehouseId, 'destination');
          const batch = await client.query<{ sku_id: string }>('SELECT sku_id FROM inventory.batch WHERE id = $1', [line.batchId]);
          if (batch.rows[0]?.sku_id !== line.skuId) throw new ConflictException('Transfer batch does not belong to SKU');
          const balance = await client.query<{ quantity_on_hand: string }>(
            `SELECT quantity_on_hand FROM inventory.inventory_balance
             WHERE sku_id = $1 AND batch_id = $2 AND warehouse_id = $3
               AND location_id = $4 AND stock_status = 'AVAILABLE'`,
            [line.skuId, line.batchId, input.sourceWarehouseId, line.sourceLocationId]
          );
          if (Number(balance.rows[0]?.quantity_on_hand ?? 0) < line.quantity) {
            throw new ConflictException('INVENTORY_ON_HAND_INSUFFICIENT');
          }
        }

        const inserted = await client.query<{ id: string; version: number }>(
          `INSERT INTO transfer.stock_transfer (
             transfer_code, transfer_type, source_warehouse_id, destination_warehouse_id,
             transit_warehouse_id, transit_location_id, requested_by, idempotency_key, request_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, version`,
          [
            transferCode,
            input.transferType,
            input.sourceWarehouseId,
            input.destinationWarehouseId,
            input.transitWarehouseId ?? null,
            input.transitLocationId ?? null,
            actorId,
            idempotencyKey,
            hash
          ]
        );
        const transfer = inserted.rows[0];
        if (!transfer) throw new Error('Transfer insert did not return a row');
        for (const [index, line] of normalizedLines.entries()) {
          await client.query(
            `INSERT INTO transfer.stock_transfer_line (
               stock_transfer_id, line_number, sku_id, batch_id, source_location_id,
               destination_location_id, planned_quantity
             ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [transfer.id, index + 1, line.skuId, line.batchId, line.sourceLocationId, line.destinationLocationId, line.quantity]
          );
        }
        await this.audit(client, actorId, 'CREATE', 'STOCK_TRANSFER', transfer.id, input.sourceWarehouseId, correlationId, null);
        return { id: transfer.id, transferCode, status: 'DRAFT', version: transfer.version, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async findTransfer(actorId: string, id: string) {
    const rows = await this.db.query<TransferRow>(
      `SELECT id, transfer_code, transfer_type, source_warehouse_id, destination_warehouse_id,
              transit_warehouse_id, transit_location_id, status, requested_by, approved_by,
              idempotency_key, request_hash, dispatch_idempotency_key, dispatch_request_hash,
              version, created_at, updated_at
       FROM transfer.stock_transfer WHERE id = $1`, [id]
    );
    const transfer = rows[0];
    if (!transfer) throw new NotFoundException('Transfer not found');
    await this.authorizeWarehouses(actorId, 'TRANSFER.VIEW', [
      transfer.source_warehouse_id,
      transfer.destination_warehouse_id,
      transfer.transit_warehouse_id ?? undefined
    ]);
    const [lines, receipts, discrepancies] = await Promise.all([
      this.db.query<TransferLineRow>(
        `SELECT id, line_number, sku_id, batch_id, source_location_id, destination_location_id,
                planned_quantity, picked_quantity, dispatched_quantity, received_quantity,
                damaged_quantity, lost_quantity
         FROM transfer.stock_transfer_line WHERE stock_transfer_id = $1 ORDER BY line_number`, [id]),
      this.db.query(
        `SELECT id, receipt_code, status, received_by, received_at
         FROM transfer.transfer_receipt WHERE stock_transfer_id = $1 ORDER BY received_at`, [id]),
      this.db.query(
        `SELECT id, stock_transfer_line_id, discrepancy_type, quantity, status, reason,
                resolution, reported_by, resolved_by, resolved_at
         FROM transfer.transfer_discrepancy WHERE stock_transfer_id = $1 ORDER BY created_at`, [id])
    ]);
    return {
      id: transfer.id,
      transferCode: transfer.transfer_code,
      transferType: transfer.transfer_type,
      sourceWarehouseId: transfer.source_warehouse_id,
      destinationWarehouseId: transfer.destination_warehouse_id,
      transitWarehouseId: transfer.transit_warehouse_id,
      transitLocationId: transfer.transit_location_id,
      status: transfer.status,
      requestedBy: transfer.requested_by,
      approvedBy: transfer.approved_by,
      version: transfer.version,
      createdAt: transfer.created_at,
      updatedAt: transfer.updated_at,
      lines,
      receipts,
      discrepancies
    };
  }

  async approveTransfer(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const transfer = await this.lockTransfer(client, id);
      await this.authorizeTransfer(actorId, 'TRANSFER.APPROVE', transfer, client);
      if (transfer.status === 'APPROVED') return { id, status: transfer.status, version: transfer.version, replayed: true };
      this.assertStateVersion(transfer, 'DRAFT', expectedVersion);
      if (transfer.requested_by === actorId) throw new ForbiddenException('FOUR_EYES_VIOLATION');
      const lines = await this.lockLines(client, id);
      for (const line of lines) {
        const balance = await client.query<{ quantity_on_hand: string }>(
          `SELECT quantity_on_hand FROM inventory.inventory_balance
           WHERE sku_id = $1 AND batch_id = $2 AND warehouse_id = $3
             AND location_id = $4 AND stock_status = 'AVAILABLE'`,
          [line.sku_id, line.batch_id, transfer.source_warehouse_id, line.source_location_id]
        );
        if (Number(balance.rows[0]?.quantity_on_hand ?? 0) < Number(line.planned_quantity)) {
          throw new ConflictException('INVENTORY_ON_HAND_INSUFFICIENT');
        }
      }
      const update = await client.query<{ version: number }>(
        `UPDATE transfer.stock_transfer
         SET status = 'APPROVED', approved_by = $2, approved_at = now(),
             version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await this.audit(client, actorId, 'APPROVE', 'STOCK_TRANSFER', id, transfer.source_warehouse_id, correlationId, null);
      return { id, status: 'APPROVED', version: update.rows[0]?.version, replayed: false };
    });
  }

  async startPicking(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const transfer = await this.lockTransfer(client, id);
      await this.authorizeTransfer(actorId, 'TRANSFER.PICK', transfer, client);
      if (transfer.status === 'PICKING') return { id, status: transfer.status, version: transfer.version, replayed: true };
      this.assertStateVersion(transfer, 'APPROVED', expectedVersion);
      const update = await client.query<{ version: number }>(
        `UPDATE transfer.stock_transfer SET status = 'PICKING', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'START_PICKING', 'STOCK_TRANSFER', id, transfer.source_warehouse_id, correlationId, null);
      return { id, status: 'PICKING', version: update.rows[0]?.version, replayed: false };
    });
  }

  async confirmPick(
    actorId: string,
    id: string,
    lineId: string,
    quantity: number,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const picked = wholeCase(quantity, 'picked quantity');
    const hash = hashCommand({ transferId: id, lineId, quantity: picked, expectedVersion });
    return this.db.transaction(async (client) => {
      const transfer = await this.lockTransfer(client, id);
      await this.authorizeTransfer(actorId, 'TRANSFER.PICK', transfer, client);
      const lines = await client.query<TransferLineRow & {
        pick_idempotency_key: string | null;
        pick_request_hash: string | null;
        pick_result_version: number | null;
      }>(
        `SELECT id, line_number, sku_id, batch_id, source_location_id, destination_location_id,
                planned_quantity, picked_quantity, dispatched_quantity, received_quantity,
                damaged_quantity, lost_quantity, pick_idempotency_key, pick_request_hash,
                pick_result_version
         FROM transfer.stock_transfer_line
         WHERE id = $1 AND stock_transfer_id = $2 FOR UPDATE`, [lineId, id]
      );
      const line = lines.rows[0];
      if (!line) throw new NotFoundException('Transfer line not found');
      if (line.pick_idempotency_key) {
        if (line.pick_idempotency_key !== idempotencyKey || line.pick_request_hash !== hash) {
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        }
        return {
          id,
          lineId,
          pickedQuantity: Number(line.picked_quantity),
          version: line.pick_result_version,
          replayed: true
        };
      }
      this.assertStateVersion(transfer, 'PICKING', expectedVersion);
      if (picked > Number(line.planned_quantity)) throw new ConflictException('Picked quantity exceeds planned quantity');
      await client.query(
        `UPDATE transfer.stock_transfer_line
         SET picked_quantity = $2, pick_idempotency_key = $3, pick_request_hash = $4,
             pick_result_version = $5
         WHERE id = $1`, [lineId, picked, idempotencyKey, hash, transfer.version + 1]
      );
      const update = await client.query<{ version: number }>(
        `UPDATE transfer.stock_transfer SET version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CONFIRM_PICK', 'STOCK_TRANSFER', id, transfer.source_warehouse_id, correlationId, null);
      return { id, lineId, pickedQuantity: picked, version: update.rows[0]?.version, replayed: false };
    });
  }

  async dispatchTransfer(
    actorId: string,
    id: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
    reason?: string
  ) {
    this.validateKey(idempotencyKey);
    const hash = hashCommand({ transferId: id, reason: reason?.trim() || null });
    try {
      return await this.db.transaction(async (client) => {
        const transfer = await this.lockTransfer(client, id);
        await this.authorizeTransfer(actorId, 'TRANSFER.DISPATCH', transfer, client);
        if (transfer.dispatch_idempotency_key) {
          if (transfer.dispatch_idempotency_key !== idempotencyKey || transfer.dispatch_request_hash !== hash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const movements = await client.query<{ id: string }>(
            `SELECT id FROM inventory.inventory_movement_ledger
             WHERE document_type IN ('LOCATION_TRANSFER','STOCK_TRANSFER_DISPATCH')
               AND document_id = $1 ORDER BY command_key`, [id]
          );
          return { id, status: transfer.status, version: transfer.version, movementIds: movements.rows.map((row) => row.id), replayed: true };
        }
        this.assertStateVersion(transfer, 'PICKING', expectedVersion);
        const lines = await this.lockLines(client, id);
        if (lines.some((line) => Number(line.picked_quantity) !== Number(line.planned_quantity))) {
          throw new ConflictException('All transfer lines must be fully picked before dispatch');
        }

        const movementIds: string[] = [];
        for (const line of lines) {
          const locationTransfer = transfer.transfer_type === 'LOCATION';
          const movement = await client.query<{ id: string }>(
            `SELECT inventory.post_movement(
               'TRANSFER', $1, $2, $3, $4, $5, $6,
               $7, $8, 'AVAILABLE', $9, $10, $11, $12, $13, $14
             ) id`,
            [
              locationTransfer ? 'LOCATION_TRANSFER' : 'STOCK_TRANSFER_DISPATCH',
              id,
              `dispatch:${line.id}`,
              line.sku_id,
              line.batch_id,
              Number(line.picked_quantity),
              transfer.source_warehouse_id,
              line.source_location_id,
              locationTransfer ? transfer.destination_warehouse_id : transfer.transit_warehouse_id,
              locationTransfer ? line.destination_location_id : transfer.transit_location_id,
              locationTransfer ? 'AVAILABLE' : 'IN_TRANSIT',
              actorId,
              correlationId,
              reason?.trim() || null
            ]
          );
          const movementId = movement.rows[0]?.id;
          if (!movementId) throw new Error('Inventory Core did not return dispatch movement');
          movementIds.push(movementId);
          await client.query(
            `UPDATE transfer.stock_transfer_line
             SET dispatched_quantity = picked_quantity,
                 received_quantity = CASE WHEN $2 THEN picked_quantity ELSE received_quantity END
             WHERE id = $1`, [line.id, locationTransfer]
          );
        }
        const nextStatus = transfer.transfer_type === 'LOCATION' ? 'RECEIVED' : 'IN_TRANSIT';
        const update = await client.query<{ version: number }>(
          `UPDATE transfer.stock_transfer
           SET status = $2, dispatch_idempotency_key = $3, dispatch_request_hash = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, nextStatus, idempotencyKey, hash]
        );
        await this.audit(client, actorId, 'DISPATCH', 'STOCK_TRANSFER', id, transfer.source_warehouse_id, correlationId, reason?.trim() || null);
        await this.outbox(client, 'STOCK_TRANSFER', id, locationTransferEvent(transfer.transfer_type), correlationId, { movementIds });
        return { id, status: nextStatus, version: update.rows[0]?.version, movementIds, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async receiveTransfer(
    actorId: string,
    id: string,
    receiptCodeInput: string,
    linesInput: readonly ReceiveTransferLineInput[],
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    const receiptCode = normalizeCode(receiptCodeInput, 'Receipt code');
    if (linesInput.length === 0) throw new ConflictException('Transfer receipt must have at least one line');
    if (new Set(linesInput.map((line) => line.transferLineId)).size !== linesInput.length) {
      throw new ConflictException('Transfer receipt contains duplicate lines');
    }
    const normalizedLines = linesInput.map((line) => ({
      ...line,
      receivedQuantity: nonnegativeWholeCase(line.receivedQuantity, 'received quantity'),
      damagedQuantity: nonnegativeWholeCase(line.damagedQuantity, 'damaged quantity'),
      missingQuantity: nonnegativeWholeCase(line.missingQuantity, 'missing quantity')
    }));
    const hash = hashCommand({ transferId: id, receiptCode, lines: normalizedLines });

    try {
      return await this.db.transaction(async (client) => {
        const replayRows = await client.query<{ id: string; stock_transfer_id: string; request_hash: string }>(
          `SELECT id, stock_transfer_id, request_hash FROM transfer.transfer_receipt
           WHERE idempotency_key = $1 FOR UPDATE`, [idempotencyKey]
        );
        const replay = replayRows.rows[0];
        if (replay) {
          if (replay.stock_transfer_id !== id || replay.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          const transfer = await this.lockTransfer(client, id);
          const movements = await client.query<{ id: string }>(
            `SELECT id FROM inventory.inventory_movement_ledger
             WHERE document_type = 'STOCK_TRANSFER_RECEIPT' AND document_id = $1 ORDER BY command_key`, [replay.id]
          );
          return { id: replay.id, transferId: id, status: transfer.status, version: transfer.version, movementIds: movements.rows.map((row) => row.id), replayed: true };
        }

        const transfer = await this.lockTransfer(client, id);
        await this.authorizeTransfer(actorId, 'TRANSFER.RECEIVE', transfer, client);
        if (transfer.transfer_type !== 'WAREHOUSE') throw new ConflictException('Location transfer does not use a receipt step');
        if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(transfer.status)) {
          throw new ConflictException(`Cannot receive transfer in ${transfer.status}`);
        }
        if (transfer.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
        const receipt = await client.query<{ id: string }>(
          `INSERT INTO transfer.transfer_receipt (
             receipt_code, stock_transfer_id, idempotency_key, request_hash, received_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [receiptCode, id, idempotencyKey, hash, actorId, correlationId]
        );
        const receiptId = receipt.rows[0]?.id;
        if (!receiptId) throw new Error('Transfer receipt insert did not return a row');
        const movementIds: string[] = [];

        for (const input of normalizedLines) {
          const row = await client.query<TransferLineRow>(
            `SELECT id, line_number, sku_id, batch_id, source_location_id, destination_location_id,
                    planned_quantity, picked_quantity, dispatched_quantity, received_quantity,
                    damaged_quantity, lost_quantity
             FROM transfer.stock_transfer_line
             WHERE id = $1 AND stock_transfer_id = $2 FOR UPDATE`, [input.transferLineId, id]
          );
          const line = row.rows[0];
          if (!line) throw new NotFoundException('Transfer line not found');
          const received = input.receivedQuantity;
          const damaged = input.damagedQuantity;
          const missing = input.missingQuantity;
          if (received + damaged + missing <= 0) throw new ConflictException('Receipt line must report a quantity');
          await this.assertLocation(client, input.destinationLocationId, transfer.destination_warehouse_id, 'destination');
          if (damaged > 0) {
            if (!input.damagedLocationId) throw new ConflictException('Damaged location is required');
            await this.assertLocation(client, input.damagedLocationId, transfer.destination_warehouse_id, 'damaged');
          }
          const remaining = Number(line.dispatched_quantity) - Number(line.received_quantity) - Number(line.damaged_quantity) - Number(line.lost_quantity);
          const openLoss = await client.query<{ quantity: string }>(
            `SELECT coalesce(sum(quantity),0)::text AS quantity
             FROM transfer.transfer_discrepancy
             WHERE stock_transfer_line_id = $1 AND discrepancy_type = 'LOSS' AND status = 'OPEN'`, [line.id]
          );
          if (received + damaged + missing + Number(openLoss.rows[0]?.quantity ?? 0) > remaining) {
            throw new ConflictException('Transfer receipt exceeds in-transit quantity');
          }

          let availableMovementId: string | null = null;
          let damagedMovementId: string | null = null;
          if (received > 0) {
            availableMovementId = await this.postReceiptMovement(
              client, receiptId, line, received, transfer, input.destinationLocationId,
              'AVAILABLE', actorId, correlationId, `available:${line.id}`
            );
            movementIds.push(availableMovementId);
          }
          if (damaged > 0 && input.damagedLocationId) {
            damagedMovementId = await this.postReceiptMovement(
              client, receiptId, line, damaged, transfer, input.damagedLocationId,
              'DAMAGED', actorId, correlationId, `damaged:${line.id}`
            );
            movementIds.push(damagedMovementId);
          }
          await client.query(
            `INSERT INTO transfer.transfer_receipt_line (
               transfer_receipt_id, stock_transfer_line_id, destination_location_id,
               damaged_location_id, received_quantity, damaged_quantity, missing_quantity,
               available_movement_id, damaged_movement_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [receiptId, line.id, input.destinationLocationId, input.damagedLocationId ?? null, received, damaged, missing, availableMovementId, damagedMovementId]
          );
          await client.query(
            `UPDATE transfer.stock_transfer_line
             SET received_quantity = received_quantity + $2,
                 damaged_quantity = damaged_quantity + $3
             WHERE id = $1`, [line.id, received, damaged]
          );
          if (damaged > 0) {
            await this.createDiscrepancy(client, transfer.id, line.id, receiptId, 'DAMAGED', damaged, actorId, input.reason);
          }
          if (missing > 0) {
            await this.createDiscrepancy(client, transfer.id, line.id, receiptId, 'LOSS', missing, actorId, input.reason);
          }
        }

        const totals = await client.query<{ remaining: string }>(
          `SELECT coalesce(sum(dispatched_quantity - received_quantity - damaged_quantity - lost_quantity),0)::text AS remaining
           FROM transfer.stock_transfer_line WHERE stock_transfer_id = $1`, [id]
        );
        const nextStatus = Number(totals.rows[0]?.remaining ?? 0) === 0 ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
        const update = await client.query<{ version: number }>(
          `UPDATE transfer.stock_transfer SET status = $2, version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id, nextStatus]
        );
        await this.audit(client, actorId, 'RECEIVE', 'STOCK_TRANSFER', id, transfer.destination_warehouse_id, correlationId, null);
        await this.outbox(client, 'STOCK_TRANSFER', id, 'STOCK_TRANSFER_RECEIVED', correlationId, { receiptId, movementIds });
        return { id: receiptId, transferId: id, status: nextStatus, version: update.rows[0]?.version, movementIds, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async resolveDiscrepancy(
    actorId: string,
    discrepancyId: string,
    resolution: string,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateKey(idempotencyKey);
    if (!resolution.trim()) throw new ConflictException('Resolution is required');
    const hash = hashCommand({ discrepancyId, resolution: resolution.trim().toUpperCase() });
    try {
      return await this.db.transaction(async (client) => {
        const rows = await client.query<{
          id: string; stock_transfer_id: string; stock_transfer_line_id: string; discrepancy_type: string;
          quantity: string; status: string; reported_by: string; resolution_idempotency_key: string | null;
          resolution_request_hash: string | null; source_warehouse_id: string; destination_warehouse_id: string;
          transit_warehouse_id: string; transit_location_id: string; transfer_status: string;
          sku_id: string; batch_id: string; lost_quantity: string;
        }>(
          `SELECT discrepancy.id, discrepancy.stock_transfer_id, discrepancy.stock_transfer_line_id,
                  discrepancy.discrepancy_type, discrepancy.quantity, discrepancy.status,
                  discrepancy.reported_by, discrepancy.resolution_idempotency_key,
                  discrepancy.resolution_request_hash, transfer.source_warehouse_id,
                  transfer.destination_warehouse_id, transfer.transit_warehouse_id,
                  transfer.transit_location_id, transfer.status AS transfer_status,
                  line.sku_id, line.batch_id, line.lost_quantity
           FROM transfer.transfer_discrepancy discrepancy
           JOIN transfer.stock_transfer transfer ON transfer.id = discrepancy.stock_transfer_id
           JOIN transfer.stock_transfer_line line ON line.id = discrepancy.stock_transfer_line_id
           WHERE discrepancy.id = $1 FOR UPDATE OF discrepancy, transfer, line`, [discrepancyId]
        );
        const discrepancy = rows.rows[0];
        if (!discrepancy) throw new NotFoundException('Transfer discrepancy not found');
        await this.authorizeWarehouses(actorId, 'TRANSFER.CLOSE', [
          discrepancy.source_warehouse_id,
          discrepancy.destination_warehouse_id,
          discrepancy.transit_warehouse_id
        ], client);
        if (discrepancy.resolution_idempotency_key) {
          if (discrepancy.resolution_idempotency_key !== idempotencyKey || discrepancy.resolution_request_hash !== hash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const movement = await client.query<{ id: string }>(
            `SELECT id FROM inventory.inventory_movement_ledger
             WHERE document_type = 'TRANSFER_LOSS' AND document_id = $1`, [discrepancyId]
          );
          return { discrepancyId, status: 'RESOLVED', movementId: movement.rows[0]?.id ?? null, replayed: true };
        }
        if (discrepancy.status !== 'OPEN') throw new ConflictException('Discrepancy is already resolved');
        if (discrepancy.reported_by === actorId) throw new ForbiddenException('FOUR_EYES_VIOLATION');
        let movementId: string | null = null;
        if (discrepancy.discrepancy_type === 'LOSS') {
          if (resolution.trim().toUpperCase() !== 'WRITE_OFF') {
            throw new ConflictException('Loss discrepancy supports WRITE_OFF; recovered stock must be received normally');
          }
          const movement = await client.query<{ id: string }>(
            `SELECT inventory.post_movement(
               'ISSUE','TRANSFER_LOSS',$1,$2,$3,$4,$5,
               $6,$7,'IN_TRANSIT',NULL,NULL,NULL,$8,$9,$10
             ) id`,
            [
              discrepancyId,
              `loss:${discrepancyId}`,
              discrepancy.sku_id,
              discrepancy.batch_id,
              Number(discrepancy.quantity),
              discrepancy.transit_warehouse_id,
              discrepancy.transit_location_id,
              actorId,
              correlationId,
              'Approved transfer loss write-off'
            ]
          );
          movementId = movement.rows[0]?.id ?? null;
          if (!movementId) throw new Error('Inventory Core did not return loss movement');
          await client.query(
            `UPDATE transfer.stock_transfer_line SET lost_quantity = lost_quantity + $2 WHERE id = $1`,
            [discrepancy.stock_transfer_line_id, Number(discrepancy.quantity)]
          );
        }
        await client.query(
          `UPDATE transfer.transfer_discrepancy
           SET status = 'RESOLVED', resolution = $2, resolved_by = $3, resolved_at = now(),
               resolution_idempotency_key = $4, resolution_request_hash = $5
           WHERE id = $1`, [discrepancyId, resolution.trim(), actorId, idempotencyKey, hash]
        );
        const totals = await client.query<{ remaining: string }>(
          `SELECT coalesce(sum(dispatched_quantity - received_quantity - damaged_quantity - lost_quantity),0)::text AS remaining
           FROM transfer.stock_transfer_line WHERE stock_transfer_id = $1`, [discrepancy.stock_transfer_id]
        );
        if (Number(totals.rows[0]?.remaining ?? 0) === 0 && ['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(discrepancy.transfer_status)) {
          await client.query(
            `UPDATE transfer.stock_transfer SET status = 'RECEIVED', version = version + 1, updated_at = now()
             WHERE id = $1`, [discrepancy.stock_transfer_id]
          );
        }
        await this.audit(client, actorId, 'RESOLVE_DISCREPANCY', 'TRANSFER_DISCREPANCY', discrepancyId, discrepancy.destination_warehouse_id, correlationId, resolution.trim());
        await this.outbox(client, 'STOCK_TRANSFER', discrepancy.stock_transfer_id, 'TRANSFER_DISCREPANCY_RESOLVED', correlationId, { discrepancyId, movementId });
        return { discrepancyId, status: 'RESOLVED', movementId, replayed: false };
      });
    } catch (error) {
      this.mapError(error);
    }
  }

  async closeTransfer(actorId: string, id: string, expectedVersion: number, correlationId: string) {
    return this.db.transaction(async (client) => {
      const transfer = await this.lockTransfer(client, id);
      await this.authorizeTransfer(actorId, 'TRANSFER.CLOSE', transfer, client);
      if (transfer.status === 'CLOSED') return { id, status: 'CLOSED', version: transfer.version, replayed: true };
      this.assertStateVersion(transfer, 'RECEIVED', expectedVersion);
      const open = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM transfer.transfer_discrepancy
         WHERE stock_transfer_id = $1 AND status = 'OPEN'`, [id]
      );
      if (Number(open.rows[0]?.count ?? 0) > 0) throw new ConflictException('Open transfer discrepancies must be resolved before close');
      const update = await client.query<{ version: number }>(
        `UPDATE transfer.stock_transfer SET status = 'CLOSED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CLOSE', 'STOCK_TRANSFER', id, transfer.destination_warehouse_id, correlationId, null);
      return { id, status: 'CLOSED', version: update.rows[0]?.version, replayed: false };
    });
  }

  async cancelTransfer(actorId: string, id: string, expectedVersion: number, correlationId: string, reason: string) {
    if (!reason.trim()) throw new ConflictException('Cancellation reason is required');
    return this.db.transaction(async (client) => {
      const transfer = await this.lockTransfer(client, id);
      await this.authorizeTransfer(actorId, 'TRANSFER.CREATE', transfer, client);
      if (transfer.status === 'CANCELLED') return { id, status: 'CANCELLED', version: transfer.version, replayed: true };
      if (!['DRAFT', 'APPROVED', 'PICKING'].includes(transfer.status)) {
        throw new ConflictException('Transfer cannot be cancelled after inventory dispatch');
      }
      if (transfer.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
      const update = await client.query<{ version: number }>(
        `UPDATE transfer.stock_transfer SET status = 'CANCELLED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'CANCEL', 'STOCK_TRANSFER', id, transfer.source_warehouse_id, correlationId, reason.trim());
      return { id, status: 'CANCELLED', version: update.rows[0]?.version, replayed: false };
    });
  }

  private async postReceiptMovement(
    client: PoolClient,
    receiptId: string,
    line: TransferLineRow,
    quantity: number,
    transfer: TransferRow,
    destinationLocationId: string,
    destinationStatus: 'AVAILABLE' | 'DAMAGED',
    actorId: string,
    correlationId: string,
    commandKey: string
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `SELECT inventory.post_movement(
         'TRANSFER','STOCK_TRANSFER_RECEIPT',$1,$2,$3,$4,$5,
         $6,$7,'IN_TRANSIT',$8,$9,$10,$11,$12,$13
       ) id`,
      [
        receiptId,
        commandKey,
        line.sku_id,
        line.batch_id,
        quantity,
        transfer.transit_warehouse_id,
        transfer.transit_location_id,
        transfer.destination_warehouse_id,
        destinationLocationId,
        destinationStatus,
        actorId,
        correlationId,
        destinationStatus === 'DAMAGED' ? 'Damaged during warehouse transfer' : null
      ]
    );
    const movementId = result.rows[0]?.id;
    if (!movementId) throw new Error('Inventory Core did not return receipt movement');
    return movementId;
  }

  private async createDiscrepancy(
    client: PoolClient,
    transferId: string,
    lineId: string,
    receiptId: string,
    type: 'DAMAGED' | 'LOSS',
    quantity: number,
    actorId: string,
    reason?: string
  ): Promise<void> {
    if (!reason?.trim()) throw new ConflictException(`${type} discrepancy reason is required`);
    await client.query(
      `INSERT INTO transfer.transfer_discrepancy (
         stock_transfer_id, stock_transfer_line_id, transfer_receipt_id,
         discrepancy_type, quantity, reported_by, reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [transferId, lineId, receiptId, type, quantity, actorId, reason.trim()]
    );
  }

  private async assertLocation(client: PoolClient, locationId: string, warehouseId: string, label: string): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM warehouse.location location
       JOIN warehouse.zone zone ON zone.id = location.zone_id
       WHERE location.id = $1 AND zone.warehouse_id = $2 AND location.status = 'ACTIVE'`,
      [locationId, warehouseId]
    );
    if (result.rowCount !== 1) throw new ConflictException(`Active ${label} location does not belong to warehouse`);
  }

  private async lockTransfer(client: PoolClient, id: string): Promise<TransferRow> {
    const result = await client.query<TransferRow>(
      `SELECT id, transfer_code, transfer_type, source_warehouse_id, destination_warehouse_id,
              transit_warehouse_id, transit_location_id, status, requested_by, approved_by,
              idempotency_key, request_hash, dispatch_idempotency_key, dispatch_request_hash,
              version, created_at, updated_at
       FROM transfer.stock_transfer WHERE id = $1 FOR UPDATE`, [id]
    );
    const transfer = result.rows[0];
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  private async lockLines(client: PoolClient, id: string): Promise<TransferLineRow[]> {
    const result = await client.query<TransferLineRow>(
      `SELECT id, line_number, sku_id, batch_id, source_location_id, destination_location_id,
              planned_quantity, picked_quantity, dispatched_quantity, received_quantity,
              damaged_quantity, lost_quantity
       FROM transfer.stock_transfer_line WHERE stock_transfer_id = $1 ORDER BY line_number FOR UPDATE`, [id]
    );
    if (result.rows.length === 0) throw new ConflictException('Transfer has no lines');
    return result.rows;
  }

  private assertStateVersion(transfer: TransferRow, status: string, expectedVersion: number): void {
    if (transfer.status !== status) throw new ConflictException(`TRANSFER_STATE_CONFLICT:${transfer.status}`);
    if (transfer.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private async authorizeTransfer(actorId: string, permission: string, transfer: TransferRow, client: PoolClient): Promise<void> {
    await this.authorizeWarehouses(actorId, permission, [
      transfer.source_warehouse_id,
      transfer.destination_warehouse_id,
      transfer.transit_warehouse_id ?? undefined
    ], client);
  }

  private async authorizeWarehouses(
    actorId: string,
    permission: string,
    warehouseIds: readonly (string | undefined)[],
    client?: PoolClient
  ): Promise<void> {
    for (const warehouseId of new Set(warehouseIds.filter((value): value is string => Boolean(value)))) {
      if (!await this.db.hasAccess(actorId, permission, warehouseId, client)) {
        throw new ForbiddenException('Permission or warehouse scope denied');
      }
    }
  }

  private validateKey(value: string): void {
    if (value.length < 16 || value.length > 128) throw new ConflictException('Idempotency-Key must contain 16 to 128 characters');
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
    const message = error instanceof Error ? error.message : 'Transfer command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Transfer code or idempotency key already exists');
    }
    if (message.includes('INVENTORY_') || message.includes('TRANSFER_')) throw new ConflictException(message);
    throw error;
  }
}

function locationTransferEvent(type: 'LOCATION' | 'WAREHOUSE'): string {
  return type === 'LOCATION' ? 'LOCATION_TRANSFER_POSTED' : 'STOCK_TRANSFER_DISPATCHED';
}
