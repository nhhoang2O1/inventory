import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  planFefo,
  requiresFefoOverride,
  validateManualAllocation,
  type AllocationSelection,
  type FefoAllocation,
  type FefoCandidate
} from './fefo-allocation.js';
import { OutboundDatabaseService } from './outbound-database.service.js';

export interface CreateIssueRequestLineInput {
  skuId: string;
  quantity: number;
  freeOfCharge?: boolean;
}

export interface CreateIssueRequestInput {
  issueCode: string;
  warehouseId: string;
  customerReferenceId?: string;
  recipientReference?: string;
  salesChannel: string;
  allowPartial?: boolean;
  lines: readonly CreateIssueRequestLineInput[];
}

export interface ManualAllocationInput extends AllocationSelection {
  lineId: string;
}

export interface AllocateIssueRequestInput {
  expectedVersion: number;
  selections?: readonly ManualAllocationInput[];
  overrideReason?: string;
}

interface IssueRequestRow {
  id: string;
  issue_code: string;
  warehouse_id: string;
  customer_reference_id: string | null;
  recipient_reference: string | null;
  sales_channel: string;
  status: string;
  allow_partial: boolean;
  requested_by: string;
  approved_by: string | null;
  idempotency_key: string;
  request_hash: string;
  allocation_idempotency_key: string | null;
  allocation_request_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface IssueRequestLineRow {
  id: string;
  line_number: number;
  sku_id: string;
  requested_quantity: string;
  allocated_quantity: string;
  picked_quantity: string;
  posted_quantity: string;
  backordered_quantity: string;
  free_of_charge: boolean;
}

export interface AllocationRow {
  id: string;
  issue_request_line_id: string;
  reservation_id: string;
  batch_id: string;
  location_id: string;
  quantity: string;
  picked_quantity: string;
  fulfilled_quantity: string;
  status: string;
  fefo_rank: number;
  override_used: boolean;
  override_reason: string | null;
}

interface PickSourceRow extends AllocationRow {
  sku_id: string;
  warehouse_id: string;
  requested_quantity: string;
  pick_task_line_id: string;
  expected_quantity: string;
  confirmed_quantity: string;
  expiration_date: string;
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

function commandHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function currentBusinessDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.BUSINESS_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

@Injectable()
export class OutboundService {
  constructor(private readonly db: OutboundDatabaseService) {}

  async createIssueRequest(
    actorId: string,
    input: CreateIssueRequestInput,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    await this.authorize(actorId, 'OUTBOUND.CREATE', input.warehouseId);
    const issueCode = normalizeCode(input.issueCode, 'Issue code');
    const salesChannel = normalizeCode(input.salesChannel, 'Sales channel');
    if (input.lines.length === 0) throw new ConflictException('Issue request must have at least one line');

    const normalizedLines = input.lines.map((line) => ({
      skuId: line.skuId,
      quantity: wholeCase(line.quantity),
      freeOfCharge: line.freeOfCharge ?? false
    }));
    const hash = commandHash({
      issueCode,
      warehouseId: input.warehouseId,
      customerReferenceId: input.customerReferenceId ?? null,
      recipientReference: input.recipientReference?.trim() || null,
      salesChannel,
      allowPartial: input.allowPartial ?? false,
      lines: normalizedLines
    });

    try {
      return await this.db.transaction(async (client) => {
      const replay = await client.query<{ id: string; request_hash: string; status: string; version: number }>(
        `SELECT id, request_hash, status, version
         FROM outbound.issue_request
         WHERE requested_by = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [actorId, idempotencyKey]
      );
      const existing = replay.rows[0];
      if (existing) {
        if (existing.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
      }

      const warehouse = await client.query('SELECT 1 FROM warehouse.warehouse WHERE id = $1 AND status = $2', [input.warehouseId, 'ACTIVE']);
      if (warehouse.rowCount !== 1) throw new NotFoundException('Active warehouse not found');
      if (input.customerReferenceId) {
        const customer = await client.query(
          'SELECT 1 FROM outbound.customer_reference WHERE id = $1 AND status = $2',
          [input.customerReferenceId, 'ACTIVE']
        );
        if (customer.rowCount !== 1) throw new NotFoundException('Active customer reference not found');
      }

      for (const line of normalizedLines) {
        const sku = await client.query('SELECT 1 FROM catalog.sku WHERE id = $1 AND status = $2', [line.skuId, 'ACTIVE']);
        if (sku.rowCount !== 1) throw new NotFoundException(`Active SKU ${line.skuId} not found`);
        await this.assertMinimumQuantity(client, line.skuId, salesChannel, line.quantity);
      }

      const inserted = await client.query<{ id: string; version: number }>(
        `INSERT INTO outbound.issue_request (
           issue_code, warehouse_id, customer_reference_id, recipient_reference, sales_channel,
           allow_partial, requested_by, idempotency_key, request_hash
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, version`,
        [
          issueCode,
          input.warehouseId,
          input.customerReferenceId ?? null,
          input.recipientReference?.trim() || null,
          salesChannel,
          input.allowPartial ?? false,
          actorId,
          idempotencyKey,
          hash
        ]
      );
      const issue = inserted.rows[0];
      if (!issue) throw new Error('Issue request insert did not return a row');

      for (const [index, line] of normalizedLines.entries()) {
        await client.query(
          `INSERT INTO outbound.issue_request_line (
             issue_request_id, line_number, sku_id, requested_quantity, free_of_charge
           ) VALUES ($1,$2,$3,$4,$5)`,
          [issue.id, index + 1, line.skuId, line.quantity, line.freeOfCharge]
        );
      }
      await this.audit(client, actorId, 'CREATE', 'ISSUE_REQUEST', issue.id, input.warehouseId, correlationId, null, false);
        return { id: issue.id, issueCode, status: 'DRAFT', version: issue.version, replayed: false };
      });
    } catch (error) {
      this.mapCommandError(error);
    }
  }

  async listIssueRequests(actorId: string, warehouseId: string, status?: string, limit = 50) {
    await this.authorize(actorId, 'OUTBOUND.VIEW', warehouseId);
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return this.db.query(
      `SELECT id, issue_code, warehouse_id, customer_reference_id, recipient_reference,
              sales_channel, status, allow_partial, requested_by, approved_by, version,
              created_at, updated_at
       FROM outbound.issue_request
       WHERE warehouse_id = $1 AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [warehouseId, status ?? null, boundedLimit]
    );
  }

  async findIssueRequest(actorId: string, id: string) {
    const issueRows = await this.db.query<IssueRequestRow>(
      `SELECT id, issue_code, warehouse_id, customer_reference_id, recipient_reference,
              sales_channel, status, allow_partial, requested_by, approved_by,
              idempotency_key, request_hash, allocation_idempotency_key,
              allocation_request_hash, version, created_at, updated_at
       FROM outbound.issue_request WHERE id = $1`,
      [id]
    );
    const issue = issueRows[0];
    if (!issue) throw new NotFoundException('Issue request not found');
    await this.authorize(actorId, 'OUTBOUND.VIEW', issue.warehouse_id);
    const [lines, allocations, tasks, goodsIssues] = await Promise.all([
      this.db.query<IssueRequestLineRow>(
        `SELECT id, line_number, sku_id, requested_quantity, allocated_quantity,
                picked_quantity, posted_quantity, backordered_quantity, free_of_charge
         FROM outbound.issue_request_line WHERE issue_request_id = $1 ORDER BY line_number`, [id]),
      this.db.query<AllocationRow>(
        `SELECT a.id, a.issue_request_line_id, a.reservation_id, a.batch_id, a.location_id,
                a.quantity, a.picked_quantity, a.fulfilled_quantity, a.status, a.fefo_rank,
                a.override_used, a.override_reason
         FROM outbound.allocation a
         JOIN outbound.issue_request_line l ON l.id = a.issue_request_line_id
         WHERE l.issue_request_id = $1 ORDER BY l.line_number, a.fefo_rank`, [id]),
      this.db.query(
        `SELECT id, task_code, status, assigned_to, version, started_at, completed_at
         FROM outbound.pick_task WHERE issue_request_id = $1`, [id]),
      this.db.query(
        `SELECT id, goods_issue_code, status, posted_by, posted_at, correlation_id
         FROM outbound.goods_issue WHERE issue_request_id = $1`, [id])
    ]);
    return {
      id: issue.id,
      issueCode: issue.issue_code,
      warehouseId: issue.warehouse_id,
      customerReferenceId: issue.customer_reference_id,
      recipientReference: issue.recipient_reference,
      salesChannel: issue.sales_channel,
      status: issue.status,
      allowPartial: issue.allow_partial,
      requestedBy: issue.requested_by,
      approvedBy: issue.approved_by,
      version: issue.version,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      lines,
      allocations,
      pickTasks: tasks,
      goodsIssues
    };
  }

  async submitIssueRequest(
    actorId: string,
    id: string,
    expectedVersion: number,
    correlationId: string
  ) {
    return this.db.transaction(async (client) => {
      const issue = await this.lockIssue(client, id);
      await this.authorize(actorId, 'OUTBOUND.CREATE', issue.warehouse_id, client);
      if (issue.status === 'SUBMITTED') return { id, status: issue.status, version: issue.version, replayed: true };
      this.assertStateAndVersion(issue, 'DRAFT', expectedVersion);
      const lines = await this.getLines(client, id);
      for (const line of lines) {
        await this.assertMinimumQuantity(client, line.sku_id, issue.sales_channel, Number(line.requested_quantity));
      }
      const updated = await client.query<{ version: number }>(
        `UPDATE outbound.issue_request
         SET status = 'SUBMITTED', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id]
      );
      await this.audit(client, actorId, 'SUBMIT', 'ISSUE_REQUEST', id, issue.warehouse_id, correlationId, null, false);
      return { id, status: 'SUBMITTED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async approveIssueRequest(
    actorId: string,
    id: string,
    expectedVersion: number,
    correlationId: string
  ) {
    return this.db.transaction(async (client) => {
      const issue = await this.lockIssue(client, id);
      await this.authorize(actorId, 'OUTBOUND.APPROVE', issue.warehouse_id, client);
      if (issue.status === 'APPROVED') return { id, status: issue.status, version: issue.version, replayed: true };
      this.assertStateAndVersion(issue, 'SUBMITTED', expectedVersion);
      if (issue.requested_by === actorId) throw new ForbiddenException('FOUR_EYES_VIOLATION');

      const lines = await this.getLines(client, id);
      const requestedBySku = new Map<string, number>();
      for (const line of lines) {
        requestedBySku.set(
          line.sku_id,
          (requestedBySku.get(line.sku_id) ?? 0) + Number(line.requested_quantity)
        );
      }
      for (const [skuId, requestedQuantity] of requestedBySku) {
        const atp = await client.query<{ atp: string }>(
          `SELECT atp FROM inventory.atp_by_sku_warehouse
           WHERE sku_id = $1 AND warehouse_id = $2`, [skuId, issue.warehouse_id]
        );
        if (Number(atp.rows[0]?.atp ?? 0) < requestedQuantity) {
          throw new ConflictException(`INVENTORY_ATP_INSUFFICIENT:${skuId}`);
        }
      }

      const updated = await client.query<{ version: number }>(
        `UPDATE outbound.issue_request
         SET status = 'APPROVED', approved_by = $2, approved_at = now(),
             version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [id, actorId]
      );
      await this.audit(client, actorId, 'APPROVE', 'ISSUE_REQUEST', id, issue.warehouse_id, correlationId, null, false);
      return { id, status: 'APPROVED', version: updated.rows[0]?.version, replayed: false };
    });
  }

  async allocateIssueRequest(
    actorId: string,
    id: string,
    input: AllocateIssueRequestInput,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    const selections = input.selections ?? [];
    const hash = commandHash({ issueRequestId: id, selections, overrideReason: input.overrideReason?.trim() || null });

    try {
      return await this.db.transaction(async (client) => {
        const issue = await this.lockIssue(client, id);
        await this.authorize(actorId, 'OUTBOUND.ALLOCATE', issue.warehouse_id, client);
        if (issue.allocation_idempotency_key) {
          if (issue.allocation_idempotency_key !== idempotencyKey || issue.allocation_request_hash !== hash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const existing = await this.getAllocations(client, id);
          return { id, status: issue.status, version: issue.version, allocations: existing, replayed: true };
        }
        this.assertStateAndVersion(issue, 'APPROVED', input.expectedVersion);

        const lines = await this.getLines(client, id);
        const lineIds = new Set(lines.map((line) => line.id));
        if (selections.some((selection) => !lineIds.has(selection.lineId))) {
          throw new ConflictException('Manual allocation references a line outside the issue request');
        }
        const createdAllocations: AllocationRow[] = [];
        let anyOverride = false;
        for (const line of lines) {
          const requestedQuantity = Number(line.requested_quantity);
          await this.assertMinimumQuantity(client, line.sku_id, issue.sales_channel, requestedQuantity);
          const reservation = await client.query<{ id: string }>(
            `SELECT inventory.reserve_inventory(
               'ISSUE_REQUEST_LINE', $1, $2, $3, $4, NULL, $5
             ) id`,
            [line.id, line.sku_id, issue.warehouse_id, requestedQuantity, `${idempotencyKey}:${line.id}`]
          );
          const reservationId = reservation.rows[0]?.id;
          if (!reservationId) throw new Error('Inventory Core did not return a reservation');

          const minimumRemainingDays = await this.minimumRemainingDays(
            client,
            line.sku_id,
            issue.customer_reference_id,
            issue.sales_channel,
            issue.warehouse_id
          );
          const candidates = await this.lockFefoCandidates(
            client,
            line.sku_id,
            issue.warehouse_id,
            currentBusinessDate(),
            minimumRemainingDays
          );
          let automaticPlan: FefoAllocation[];
          try {
            automaticPlan = planFefo(candidates, requestedQuantity);
          } catch (error) {
            throw new ConflictException(error instanceof Error ? error.message : 'OUTBOUND_FEFO_STOCK_INSUFFICIENT');
          }

          const manualForLine = selections.filter((selection) => selection.lineId === line.id);
          let selectedPlan = automaticPlan;
          let overrideUsed = false;
          if (manualForLine.length > 0) {
            try {
              selectedPlan = validateManualAllocation(candidates, requestedQuantity, manualForLine);
            } catch (error) {
              throw new ConflictException(error instanceof Error ? error.message : 'Invalid manual allocation');
            }
            overrideUsed = requiresFefoOverride(automaticPlan, selectedPlan);
            if (overrideUsed) {
              if (!input.overrideReason?.trim()) throw new ConflictException('FEFO_OVERRIDE_REASON_REQUIRED');
              await this.authorize(actorId, 'OUTBOUND.FEFO_OVERRIDE', issue.warehouse_id, client);
              anyOverride = true;
            }
          }

          for (const allocation of selectedPlan) {
            const inserted = await client.query<AllocationRow>(
              `INSERT INTO outbound.allocation (
                 issue_request_line_id, reservation_id, batch_id, location_id, quantity,
                 fefo_rank, override_used, override_reason, allocated_by
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               RETURNING id, issue_request_line_id, reservation_id, batch_id, location_id,
                         quantity, picked_quantity, fulfilled_quantity, status, fefo_rank,
                         override_used, override_reason`,
              [
                line.id,
                reservationId,
                allocation.batchId,
                allocation.locationId,
                allocation.quantity,
                allocation.fefoRank,
                overrideUsed,
                overrideUsed ? input.overrideReason?.trim() : null,
                actorId
              ]
            );
            const row = inserted.rows[0];
            if (row) createdAllocations.push(row);
          }
          await client.query(
            `UPDATE outbound.issue_request_line SET allocated_quantity = $2 WHERE id = $1`,
            [line.id, requestedQuantity]
          );
        }

        const updated = await client.query<{ version: number }>(
          `UPDATE outbound.issue_request
           SET status = 'ALLOCATED', allocation_idempotency_key = $2,
               allocation_request_hash = $3, version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`,
          [id, idempotencyKey, hash]
        );
        await this.audit(
          client,
          actorId,
          anyOverride ? 'ALLOCATE_FEFO_OVERRIDE' : 'ALLOCATE_FEFO',
          'ISSUE_REQUEST',
          id,
          issue.warehouse_id,
          correlationId,
          anyOverride ? input.overrideReason?.trim() ?? null : null,
          anyOverride
        );
        return {
          id,
          status: 'ALLOCATED',
          version: updated.rows[0]?.version,
          allocations: createdAllocations,
          replayed: false
        };
      });
    } catch (error) {
      this.mapCommandError(error);
    }
  }

  async createPickTask(
    actorId: string,
    issueRequestId: string,
    expectedVersion: number,
    assignedTo: string | undefined,
    correlationId: string
  ) {
    return this.db.transaction(async (client) => {
      const issue = await this.lockIssue(client, issueRequestId);
      await this.authorize(actorId, 'OUTBOUND.PICK', issue.warehouse_id, client);
      const existing = await client.query<{ id: string; task_code: string; status: string; version: number }>(
        `SELECT id, task_code, status, version FROM outbound.pick_task
         WHERE issue_request_id = $1 FOR UPDATE`, [issueRequestId]
      );
      if (existing.rows[0]) return { ...existing.rows[0], replayed: true };
      this.assertStateAndVersion(issue, 'ALLOCATED', expectedVersion);

      const inserted = await client.query<{ id: string; task_code: string; status: string; version: number }>(
        `INSERT INTO outbound.pick_task (task_code, issue_request_id, assigned_to, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id, task_code, status, version`,
        [`PICK-${issue.issue_code}`, issueRequestId, assignedTo ?? actorId, actorId]
      );
      const task = inserted.rows[0];
      if (!task) throw new Error('Pick task insert did not return a row');
      const lineInsert = await client.query(
        `INSERT INTO outbound.pick_task_line (pick_task_id, allocation_id, expected_quantity)
         SELECT $1, a.id, a.quantity
         FROM outbound.allocation a
         JOIN outbound.issue_request_line l ON l.id = a.issue_request_line_id
         WHERE l.issue_request_id = $2 AND a.status = 'ACTIVE'`,
        [task.id, issueRequestId]
      );
      if ((lineInsert.rowCount ?? 0) === 0) throw new ConflictException('No active allocations found');
      const issueUpdate = await client.query<{ version: number }>(
        `UPDATE outbound.issue_request
         SET status = 'PICKING', version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [issueRequestId]
      );
      await this.audit(client, actorId, 'CREATE_PICK_TASK', 'PICK_TASK', task.id, issue.warehouse_id, correlationId, null, false);
      await this.outbox(client, 'PICK_TASK', task.id, 'PICK_TASK_CREATED', correlationId, { issueRequestId });
      return { ...task, issueRequestVersion: issueUpdate.rows[0]?.version, replayed: false };
    });
  }

  async confirmPick(
    actorId: string,
    taskId: string,
    allocationId: string,
    barcode: string,
    quantity: number,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    const confirmedQuantity = wholeCase(quantity, 'picked quantity');
    const hash = commandHash({ taskId, allocationId, barcode: barcode.trim(), quantity: confirmedQuantity });
    return this.db.transaction(async (client) => {
      const taskRows = await client.query<{
        id: string; status: string; version: number; issue_request_id: string; warehouse_id: string;
      }>(
        `SELECT pt.id, pt.status, pt.version, pt.issue_request_id, ir.warehouse_id
         FROM outbound.pick_task pt
         JOIN outbound.issue_request ir ON ir.id = pt.issue_request_id
         WHERE pt.id = $1 FOR UPDATE OF pt`, [taskId]
      );
      const task = taskRows.rows[0];
      if (!task) throw new NotFoundException('Pick task not found');
      await this.authorize(actorId, 'OUTBOUND.PICK', task.warehouse_id, client);
      const replayRows = await client.query<{
        request_hash: string; cumulative_picked_quantity: string; task_status: string; task_version: number;
      }>(
        `SELECT request_hash, cumulative_picked_quantity, task_status, task_version
         FROM outbound.pick_confirmation WHERE idempotency_key = $1`, [idempotencyKey]
      );
      const replay = replayRows.rows[0];
      if (replay) {
        if (replay.request_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return {
          taskId,
          allocationId,
          pickedQuantity: Number(replay.cumulative_picked_quantity),
          status: replay.task_status,
          version: replay.task_version,
          replayed: true
        };
      }
      if (!['READY', 'IN_PROGRESS'].includes(task.status)) throw new ConflictException(`Cannot pick task in ${task.status}`);
      if (task.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');

      const lineRows = await client.query<{
        id: string; sku_id: string; expected_quantity: string; picked_quantity: string;
      }>(
        `SELECT ptl.id, irl.sku_id, ptl.expected_quantity, ptl.picked_quantity
         FROM outbound.pick_task_line ptl
         JOIN outbound.allocation a ON a.id = ptl.allocation_id
         JOIN outbound.issue_request_line irl ON irl.id = a.issue_request_line_id
         WHERE ptl.pick_task_id = $1 AND ptl.allocation_id = $2
         FOR UPDATE OF ptl`, [taskId, allocationId]
      );
      const line = lineRows.rows[0];
      if (!line) throw new NotFoundException('Pick task allocation not found');
      const barcodeRows = await client.query<{ sku_id: string }>(
        `SELECT sku_id FROM catalog.barcode
         WHERE value = $1 AND valid_from <= now()
           AND (valid_until IS NULL OR valid_until > now())`, [barcode.trim()]
      );
      if (barcodeRows.rows[0]?.sku_id !== line.sku_id) throw new ConflictException('PICK_BARCODE_SKU_MISMATCH');

      const newPickedQuantity = Number(line.picked_quantity) + confirmedQuantity;
      if (newPickedQuantity > Number(line.expected_quantity)) throw new ConflictException('PICK_QUANTITY_EXCEEDS_ALLOCATION');
      await client.query(
        `UPDATE outbound.pick_task_line
         SET picked_quantity = $2, last_scanned_barcode = $3, picked_by = $4, picked_at = now()
         WHERE id = $1`, [line.id, newPickedQuantity, barcode.trim(), actorId]
      );
      await client.query(
        `UPDATE outbound.allocation
         SET picked_quantity = $2,
             status = CASE WHEN $2 = quantity THEN 'PICKED' ELSE 'ACTIVE' END
         WHERE id = $1`, [allocationId, newPickedQuantity]
      );
      await client.query(
        `UPDATE outbound.issue_request_line irl
         SET picked_quantity = totals.picked
         FROM (
           SELECT a.issue_request_line_id, sum(a.picked_quantity)::bigint AS picked
           FROM outbound.allocation a WHERE a.issue_request_line_id = (
             SELECT issue_request_line_id FROM outbound.allocation WHERE id = $1
           ) GROUP BY a.issue_request_line_id
         ) totals
         WHERE irl.id = totals.issue_request_line_id`, [allocationId]
      );

      const remaining = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM outbound.pick_task_line
         WHERE pick_task_id = $1 AND picked_quantity < expected_quantity`, [taskId]
      );
      const completed = Number(remaining.rows[0]?.count ?? 0) === 0;
      const taskUpdate = await client.query<{ version: number }>(
        `UPDATE outbound.pick_task
         SET status = $2, started_at = coalesce(started_at, now()),
             completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE NULL END,
             version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`, [taskId, completed ? 'COMPLETED' : 'IN_PROGRESS']
      );
      const nextTaskVersion = taskUpdate.rows[0]?.version;
      if (!nextTaskVersion) throw new Error('Pick task version was not returned');
      await client.query(
        `INSERT INTO outbound.pick_confirmation (
           pick_task_line_id, idempotency_key, request_hash, confirmed_quantity,
           cumulative_picked_quantity, task_status, task_version, confirmed_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          line.id,
          idempotencyKey,
          hash,
          confirmedQuantity,
          newPickedQuantity,
          completed ? 'COMPLETED' : 'IN_PROGRESS',
          nextTaskVersion,
          actorId
        ]
      );
      await this.audit(client, actorId, 'CONFIRM_PICK', 'PICK_TASK', taskId, task.warehouse_id, correlationId, null, false);
      return {
        taskId,
        allocationId,
        pickedQuantity: newPickedQuantity,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        version: nextTaskVersion,
        replayed: false
      };
    });
  }

  async postGoodsIssue(
    actorId: string,
    issueRequestId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
    reason?: string
  ) {
    this.validateIdempotencyKey(idempotencyKey);
    const hash = commandHash({ issueRequestId, reason: reason?.trim() || null });
    try {
      return await this.db.transaction(async (client) => {
        const replayRows = await client.query<{
          id: string; issue_request_id: string; goods_issue_code: string; status: string; request_hash: string;
        }>(
          `SELECT id, issue_request_id, goods_issue_code, status, request_hash
           FROM outbound.goods_issue WHERE idempotency_key = $1 FOR UPDATE`, [idempotencyKey]
        );
        const replay = replayRows.rows[0];
        if (replay) {
          if (replay.issue_request_id !== issueRequestId || replay.request_hash !== hash) {
            throw new ConflictException('IDEMPOTENCY_CONFLICT');
          }
          const movements = await client.query<{ id: string }>(
            `SELECT movement.id
             FROM outbound.goods_issue_line gil
             JOIN outbound.allocation allocation ON allocation.id = gil.allocation_id
             JOIN outbound.issue_request_line line ON line.id = allocation.issue_request_line_id
             JOIN inventory.inventory_movement_ledger movement
               ON movement.document_type = 'GOODS_ISSUE'
              AND movement.document_id = gil.goods_issue_id
              AND movement.command_key = gil.goods_issue_id::text || ':' || allocation.id::text
             WHERE gil.goods_issue_id = $1
             ORDER BY line.line_number, allocation.fefo_rank`, [replay.id]
          );
          return { id: replay.id, goodsIssueCode: replay.goods_issue_code, status: replay.status, movementIds: movements.rows.map((row) => row.id), replayed: true };
        }

        const issue = await this.lockIssue(client, issueRequestId);
        await this.authorize(actorId, 'OUTBOUND.POST', issue.warehouse_id, client);
        this.assertStateAndVersion(issue, 'PICKING', expectedVersion);
        const sources = await client.query<PickSourceRow>(
          `SELECT a.id, a.issue_request_line_id, a.reservation_id, a.batch_id, a.location_id,
                  a.quantity, a.picked_quantity, a.fulfilled_quantity, a.status, a.fefo_rank,
                  a.override_used, a.override_reason, irl.sku_id, ir.warehouse_id,
                  irl.requested_quantity, ptl.id AS pick_task_line_id,
                  ptl.expected_quantity, ptl.picked_quantity AS confirmed_quantity,
                  b.expiration_date
           FROM outbound.allocation a
           JOIN outbound.issue_request_line irl ON irl.id = a.issue_request_line_id
           JOIN outbound.issue_request ir ON ir.id = irl.issue_request_id
           JOIN outbound.pick_task pt ON pt.issue_request_id = ir.id
           JOIN outbound.pick_task_line ptl ON ptl.pick_task_id = pt.id AND ptl.allocation_id = a.id
           JOIN inventory.batch b ON b.id = a.batch_id
           WHERE ir.id = $1
           ORDER BY irl.line_number, a.fefo_rank
           FOR UPDATE OF a, ptl`, [issueRequestId]
        );
        if (sources.rows.length === 0) throw new ConflictException('No pick confirmations found');

        const goodsIssue = await client.query<{ id: string; goods_issue_code: string }>(
          `INSERT INTO outbound.goods_issue (
             goods_issue_code, issue_request_id, status, idempotency_key,
             request_hash, correlation_id
           ) VALUES ($1,$2,'DRAFT',$3,$4,$5)
           RETURNING id, goods_issue_code`,
          [`GI-${issue.issue_code}`, issueRequestId, idempotencyKey, hash, correlationId]
        );
        const document = goodsIssue.rows[0];
        if (!document) throw new Error('Goods issue insert did not return a row');

        const byLine = new Map<string, PickSourceRow[]>();
        for (const source of sources.rows) {
          const list = byLine.get(source.issue_request_line_id) ?? [];
          list.push(source);
          byLine.set(source.issue_request_line_id, list);
        }
        const movementIds: string[] = [];
        let postedTotal = 0;
        const businessDate = currentBusinessDate();
        for (const [lineId, lineSources] of byLine) {
          const first = lineSources[0];
          if (!first) continue;
          const requested = Number(first.requested_quantity);
          const picked = lineSources.reduce((sum, source) => sum + Number(source.confirmed_quantity), 0);
          if (!issue.allow_partial && picked !== requested) throw new ConflictException('PARTIAL_PICK_NOT_ALLOWED');
          if (picked > 0) await this.assertMinimumQuantity(client, first.sku_id, issue.sales_channel, picked);
          postedTotal += picked;

          const minimumRemainingDays = await this.minimumRemainingDays(
            client,
            first.sku_id,
            issue.customer_reference_id,
            issue.sales_channel,
            issue.warehouse_id
          );
          for (const source of lineSources) {
            const confirmed = Number(source.confirmed_quantity);
            if (confirmed === 0) continue;
            const expiration = new Date(`${source.expiration_date}T00:00:00.000Z`);
            const business = new Date(`${businessDate}T00:00:00.000Z`);
            const remainingDays = Math.floor((expiration.getTime() - business.getTime()) / 86_400_000);
            if (remainingDays < minimumRemainingDays) throw new ConflictException('OUTBOUND_MRSL_NOT_MET');

            await client.query(
              'SELECT inventory.fulfill_reservation($1,$2,$3,$4)',
              [source.reservation_id, source.sku_id, issue.warehouse_id, confirmed]
            );
            const movement = await client.query<{ id: string }>(
              `SELECT inventory.post_movement(
                 'ISSUE', 'GOODS_ISSUE', $1, $2, $3, $4, $5,
                 $6, $7, 'AVAILABLE', NULL, NULL, NULL, $8, $9, $10
               ) id`,
              [
                document.id,
                `${document.id}:${source.id}`,
                source.sku_id,
                source.batch_id,
                confirmed,
                issue.warehouse_id,
                source.location_id,
                actorId,
                correlationId,
                reason?.trim() || null
              ]
            );
            const movementId = movement.rows[0]?.id;
            if (!movementId) throw new Error('Inventory Core did not return a movement');
            movementIds.push(movementId);
            await client.query(
              `INSERT INTO outbound.goods_issue_line (
                 goods_issue_id, allocation_id, reservation_id, sku_id, batch_id, location_id, quantity
               ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [document.id, source.id, source.reservation_id, source.sku_id, source.batch_id, source.location_id, confirmed]
            );
            await client.query(
              `UPDATE outbound.allocation
               SET fulfilled_quantity = $2,
                   status = CASE WHEN $2 = quantity THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END
               WHERE id = $1`, [source.id, confirmed]
            );
          }

          const unpicked = requested - picked;
          if (unpicked > 0) {
            await client.query('SELECT inventory.release_reservation($1,$2)', [first.reservation_id, unpicked]);
          }
          await client.query(
            `UPDATE outbound.issue_request_line
             SET posted_quantity = $2, backordered_quantity = $3
             WHERE id = $1`, [lineId, picked, unpicked]
          );
        }
        if (postedTotal === 0) throw new ConflictException('Goods issue requires at least one picked whole case');

        await client.query(
          `UPDATE outbound.goods_issue
           SET status = 'POSTED', posted_by = $2, posted_at = now(),
               version = version + 1, updated_at = now()
           WHERE id = $1`, [document.id, actorId]
        );
        await client.query(
          `UPDATE outbound.pick_task
           SET status = 'COMPLETED', completed_at = now(), version = version + 1, updated_at = now()
           WHERE issue_request_id = $1`, [issueRequestId]
        );
        const issueUpdate = await client.query<{ version: number }>(
          `UPDATE outbound.issue_request
           SET status = 'POSTED', version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [issueRequestId]
        );
        await this.audit(client, actorId, 'POST', 'GOODS_ISSUE', document.id, issue.warehouse_id, correlationId, reason?.trim() || null, false);
        await this.outbox(client, 'GOODS_ISSUE', document.id, 'GOODS_ISSUE_POSTED', correlationId, {
          issueRequestId,
          movementIds
        });
        return {
          id: document.id,
          goodsIssueCode: document.goods_issue_code,
          status: 'POSTED',
          issueRequestVersion: issueUpdate.rows[0]?.version,
          movementIds,
          replayed: false
        };
      });
    } catch (error) {
      this.mapCommandError(error);
    }
  }

  async cancelIssueRequest(
    actorId: string,
    id: string,
    expectedVersion: number,
    correlationId: string,
    reason: string
  ) {
    if (!reason.trim()) throw new ConflictException('Cancellation reason is required');
    try {
      return await this.db.transaction(async (client) => {
        const issue = await this.lockIssue(client, id);
        await this.authorize(actorId, 'OUTBOUND.CANCEL', issue.warehouse_id, client);
        if (issue.status === 'CANCELLED') return { id, status: 'CANCELLED', version: issue.version, replayed: true };
        if (issue.status === 'POSTED') throw new ConflictException('Posted issue request cannot be cancelled');
        if (issue.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');

        const reservations = await client.query<{ id: string; remaining: string }>(
          `SELECT r.id,
                  (r.quantity_reserved - r.quantity_fulfilled - r.quantity_released)::text AS remaining
           FROM inventory.inventory_reservation r
           WHERE r.id IN (
             SELECT a.reservation_id
             FROM outbound.allocation a
             JOIN outbound.issue_request_line l ON l.id = a.issue_request_line_id
             WHERE l.issue_request_id = $1
           ) AND r.status = 'ACTIVE'
           FOR UPDATE OF r`, [id]
        );
        for (const reservation of reservations.rows) {
          const remaining = Number(reservation.remaining);
          if (remaining > 0) await client.query('SELECT inventory.release_reservation($1,$2)', [reservation.id, remaining]);
        }
        await client.query(
          `UPDATE outbound.allocation a SET status = 'RELEASED'
           FROM outbound.issue_request_line l
           WHERE a.issue_request_line_id = l.id AND l.issue_request_id = $1
             AND a.status IN ('ACTIVE','PICKED')`, [id]
        );
        await client.query(
          `UPDATE outbound.pick_task
           SET status = 'CANCELLED', version = version + 1, updated_at = now()
           WHERE issue_request_id = $1 AND status <> 'COMPLETED'`, [id]
        );
        const updated = await client.query<{ version: number }>(
          `UPDATE outbound.issue_request
           SET status = 'CANCELLED', version = version + 1, updated_at = now()
           WHERE id = $1 RETURNING version`, [id]
        );
        await this.audit(client, actorId, 'CANCEL', 'ISSUE_REQUEST', id, issue.warehouse_id, correlationId, reason.trim(), false);
        await this.outbox(client, 'ISSUE_REQUEST', id, 'ISSUE_REQUEST_CANCELLED', correlationId, { reason: reason.trim() });
        return { id, status: 'CANCELLED', version: updated.rows[0]?.version, replayed: false };
      });
    } catch (error) {
      this.mapCommandError(error);
    }
  }

  private async lockIssue(client: PoolClient, id: string): Promise<IssueRequestRow> {
    const rows = await client.query<IssueRequestRow>(
      `SELECT id, issue_code, warehouse_id, customer_reference_id, recipient_reference,
              sales_channel, status, allow_partial, requested_by, approved_by,
              idempotency_key, request_hash, allocation_idempotency_key,
              allocation_request_hash, version, created_at, updated_at
       FROM outbound.issue_request WHERE id = $1 FOR UPDATE`, [id]
    );
    const issue = rows.rows[0];
    if (!issue) throw new NotFoundException('Issue request not found');
    return issue;
  }

  private async getLines(client: PoolClient, issueRequestId: string): Promise<IssueRequestLineRow[]> {
    const rows = await client.query<IssueRequestLineRow>(
      `SELECT id, line_number, sku_id, requested_quantity, allocated_quantity,
              picked_quantity, posted_quantity, backordered_quantity, free_of_charge
       FROM outbound.issue_request_line
       WHERE issue_request_id = $1 ORDER BY line_number FOR UPDATE`, [issueRequestId]
    );
    if (rows.rows.length === 0) throw new ConflictException('Issue request has no lines');
    return rows.rows;
  }

  private async getAllocations(client: PoolClient, issueRequestId: string): Promise<AllocationRow[]> {
    return (await client.query<AllocationRow>(
      `SELECT a.id, a.issue_request_line_id, a.reservation_id, a.batch_id, a.location_id,
              a.quantity, a.picked_quantity, a.fulfilled_quantity, a.status, a.fefo_rank,
              a.override_used, a.override_reason
       FROM outbound.allocation a
       JOIN outbound.issue_request_line l ON l.id = a.issue_request_line_id
       WHERE l.issue_request_id = $1 ORDER BY l.line_number, a.fefo_rank`, [issueRequestId]
    )).rows;
  }

  private async lockFefoCandidates(
    client: PoolClient,
    skuId: string,
    warehouseId: string,
    businessDate: string,
    minimumRemainingDays: number
  ): Promise<FefoCandidate[]> {
    const rows = await client.query<{
      balance_id: string;
      batch_id: string;
      location_id: string;
      expiration_date: string;
      first_received_date: string | null;
      allocatable_quantity: string;
    }>(
      `SELECT b.id AS balance_id, b.batch_id, b.location_id, bt.expiration_date,
              bt.first_received_date,
              greatest(
                b.quantity_on_hand - coalesce((
                  SELECT sum(a.quantity - a.fulfilled_quantity)
                  FROM outbound.allocation a
                  JOIN outbound.issue_request_line irl ON irl.id = a.issue_request_line_id
                  JOIN outbound.issue_request ir ON ir.id = irl.issue_request_id
                  WHERE a.batch_id = b.batch_id AND a.location_id = b.location_id
                    AND ir.warehouse_id = b.warehouse_id
                    AND a.status IN ('ACTIVE','PICKED')
                ), 0), 0
              )::text AS allocatable_quantity
       FROM inventory.inventory_balance b
       JOIN inventory.batch bt ON bt.id = b.batch_id
       JOIN warehouse.location l ON l.id = b.location_id AND l.status = 'ACTIVE'
       WHERE b.sku_id = $1 AND b.warehouse_id = $2
         AND b.stock_status = 'AVAILABLE' AND b.quantity_on_hand > 0
         AND bt.expiration_date >= $3::date
         AND (bt.expiration_date - $3::date) >= $4
       ORDER BY bt.expiration_date, bt.first_received_date NULLS LAST, b.batch_id, b.location_id
       FOR UPDATE OF b`,
      [skuId, warehouseId, businessDate, minimumRemainingDays]
    );
    return rows.rows
      .map((row) => ({
        balanceId: row.balance_id,
        batchId: row.batch_id,
        locationId: row.location_id,
        expirationDate: String(row.expiration_date),
        firstReceivedDate: row.first_received_date === null ? null : String(row.first_received_date),
        allocatableQuantity: Number(row.allocatable_quantity)
      }))
      .filter((row) => row.allocatableQuantity > 0);
  }

  private async assertMinimumQuantity(
    client: PoolClient,
    skuId: string,
    salesChannel: string,
    quantity: number
  ): Promise<void> {
    const rows = await client.query<{ minimum_quantity: string; exception_mode: string }>(
      `SELECT minimum_quantity, exception_mode
       FROM catalog.wholesale_quantity_policy
       WHERE sku_id = $1 AND direction = 'OUTBOUND' AND supplier_id IS NULL
         AND (sales_channel = $2 OR sales_channel IS NULL)
         AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())
       ORDER BY (sales_channel IS NOT NULL) DESC, valid_from DESC
       LIMIT 1`, [skuId, salesChannel]
    );
    const policy = rows.rows[0];
    if (policy && quantity < Number(policy.minimum_quantity)) {
      throw new ConflictException(`MINIMUM_QUANTITY_NOT_MET:${policy.minimum_quantity}`);
    }
  }

  private async minimumRemainingDays(
    client: PoolClient,
    skuId: string,
    customerReferenceId: string | null,
    salesChannel: string,
    warehouseId: string
  ): Promise<number> {
    const rows = await client.query<{ minimum_remaining_days: number }>(
      `SELECT minimum_remaining_days
       FROM outbound.mrsl_policy
       WHERE sku_id = $1
         AND (customer_reference_id = $2 OR customer_reference_id IS NULL)
         AND (sales_channel = $3 OR sales_channel IS NULL)
         AND (warehouse_id = $4 OR warehouse_id IS NULL)
         AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())
       ORDER BY
         ((customer_reference_id IS NOT NULL)::int
          + (sales_channel IS NOT NULL)::int
          + (warehouse_id IS NOT NULL)::int) DESC,
         valid_from DESC
       LIMIT 1`, [skuId, customerReferenceId, salesChannel, warehouseId]
    );
    return Number(rows.rows[0]?.minimum_remaining_days ?? 0);
  }

  private assertStateAndVersion(issue: IssueRequestRow, expectedStatus: string, expectedVersion: number): void {
    if (issue.status !== expectedStatus) throw new ConflictException(`OUTBOUND_STATE_CONFLICT:${issue.status}`);
    if (issue.version !== expectedVersion) throw new ConflictException('VERSION_CONFLICT');
  }

  private validateIdempotencyKey(value: string): void {
    if (value.length < 16 || value.length > 128) {
      throw new ConflictException('Idempotency-Key must contain 16 to 128 characters');
    }
  }

  private async authorize(
    actorId: string,
    permission: string,
    warehouseId: string,
    client?: PoolClient
  ): Promise<void> {
    if (!await this.db.hasAccess(actorId, permission, warehouseId, client)) {
      throw new ForbiddenException('Permission or warehouse scope denied');
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
    reason: string | null,
    overrideUsed: boolean
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.audit_event (
         actor_id, action, resource_type, resource_id, warehouse_id,
         correlation_id, reason, override_used, after_data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [actorId, action, resourceType, resourceId, warehouseId, correlationId, reason, overrideUsed, { status: action }]
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
      `INSERT INTO platform.outbox_event (
         aggregate_type, aggregate_id, event_type, payload, correlation_id
       ) VALUES ($1,$2,$3,$4,$5)`,
      [aggregateType, aggregateId, eventType, payload, correlationId]
    );
  }

  private mapCommandError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const message = error instanceof Error ? error.message : 'Outbound command conflict';
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      throw new ConflictException('Outbound code or idempotency key already exists');
    }
    if (message.includes('OUTBOUND_') || message.includes('INVENTORY_') || message.includes('reservation')) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
