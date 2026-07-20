import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanningDatabaseService } from './planning-database.service.js';

export interface CreateReorderPolicyInput {
  warehouseId: string;
  skuId: string;
  supplierId: string;
  leadTimeDays: number;
  safetyStockQuantity: number;
  coverageDays: number;
  salesWindowDays?: number;
  orderMultiple?: number;
  minimumStockQuantity?: number;
  maximumStockQuantity?: number;
  validFrom: string;
  validUntil?: string;
}

interface PolicyRow {
  id: string;
  warehouse_id: string;
  sku_id: string;
  supplier_id: string;
  lead_time_days: number;
  safety_stock_quantity: string;
  coverage_days: number;
  sales_window_days: number;
  order_multiple: string;
  minimum_stock_quantity: string | null;
  maximum_stock_quantity: string | null;
  valid_from: string;
  valid_until: string | null;
  status: string;
  created_by: string;
  idempotency_key: string;
  request_hash: string;
  correlation_id: string;
  created_at: string;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function integer(value: number | undefined, name: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new ConflictException(`${name} must be a whole number greater than or equal to ${minimum}`);
  }
  return Number(value);
}

function dateOnly(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ConflictException(`${name} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function asNumber(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new ConflictException('Planning quantity exceeds the supported whole-case range');
  return result;
}

@Injectable()
export class PlanningService {
  constructor(private readonly db: PlanningDatabaseService) {}

  private async requireAccess(actorId: string, permission: string, warehouseId: string): Promise<void> {
    if (!await this.db.hasAccess(actorId, permission, warehouseId)) {
      throw new ForbiddenException(`${permission} is required for the warehouse scope`);
    }
  }

  async createPolicy(
    actorId: string,
    input: CreateReorderPolicyInput,
    idempotencyKey: string,
    correlationId: string
  ) {
    const normalized = {
      ...input,
      leadTimeDays: integer(input.leadTimeDays, 'leadTimeDays', 0),
      safetyStockQuantity: integer(input.safetyStockQuantity, 'safetyStockQuantity', 0),
      coverageDays: integer(input.coverageDays, 'coverageDays', 1),
      salesWindowDays: integer(input.salesWindowDays ?? 30, 'salesWindowDays', 1),
      orderMultiple: integer(input.orderMultiple ?? 1, 'orderMultiple', 1),
      minimumStockQuantity: input.minimumStockQuantity === undefined
        ? undefined : integer(input.minimumStockQuantity, 'minimumStockQuantity', 0),
      maximumStockQuantity: input.maximumStockQuantity === undefined
        ? undefined : integer(input.maximumStockQuantity, 'maximumStockQuantity', 1),
      validFrom: dateOnly(input.validFrom, 'validFrom'),
      validUntil: input.validUntil ? dateOnly(input.validUntil, 'validUntil') : undefined
    };
    if (normalized.validUntil && normalized.validUntil <= normalized.validFrom) {
      throw new ConflictException('validUntil must be later than validFrom');
    }
    if (normalized.maximumStockQuantity !== undefined && normalized.minimumStockQuantity !== undefined
      && normalized.maximumStockQuantity < normalized.minimumStockQuantity) {
      throw new ConflictException('maximumStockQuantity cannot be lower than minimumStockQuantity');
    }
    const requestHash = stableHash(normalized);

    return this.db.transaction(async (client) => {
      if (!await this.db.hasAccess(actorId, 'PLANNING.CONFIGURE', input.warehouseId, client)) {
        throw new ForbiddenException('PLANNING.CONFIGURE is required for the warehouse scope');
      }
      const replay = await client.query<PolicyRow>(
        'SELECT * FROM planning.reorder_policy WHERE created_by = $1 AND idempotency_key = $2',
        [actorId, idempotencyKey]
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return { ...this.policyResponse(replay.rows[0]), replayed: true };
      }
      const references = await client.query<{ sku_active: boolean; supplier_active: boolean; warehouse_exists: boolean }>(`
        SELECT
          EXISTS (SELECT 1 FROM catalog.sku WHERE id = $1 AND status = 'ACTIVE') AS sku_active,
          EXISTS (SELECT 1 FROM purchasing.supplier WHERE id = $2 AND status = 'ACTIVE') AS supplier_active,
          EXISTS (SELECT 1 FROM warehouse.warehouse WHERE id = $3 AND status = 'ACTIVE') AS warehouse_exists`,
        [input.skuId, input.supplierId, input.warehouseId]
      );
      if (!references.rows[0]?.sku_active) throw new NotFoundException('Active SKU not found');
      if (!references.rows[0]?.supplier_active) throw new NotFoundException('Active supplier not found');
      if (!references.rows[0]?.warehouse_exists) throw new NotFoundException('Active warehouse not found');

      const overlap = await client.query<{ id: string }>(`
        SELECT id FROM planning.reorder_policy
        WHERE warehouse_id = $1 AND sku_id = $2 AND status = 'ACTIVE'
          AND valid_from < coalesce($4::date, 'infinity'::date)
          AND coalesce(valid_until, 'infinity'::date) > $3::date
        LIMIT 1`, [input.warehouseId, input.skuId, normalized.validFrom, normalized.validUntil ?? null]);
      if (overlap.rows[0]) throw new ConflictException('An active reorder policy overlaps this effective period');

      const inserted = await client.query<PolicyRow>(`
        INSERT INTO planning.reorder_policy (
          warehouse_id, sku_id, supplier_id, lead_time_days, safety_stock_quantity, coverage_days,
          sales_window_days, order_multiple, minimum_stock_quantity, maximum_stock_quantity,
          valid_from, valid_until, created_by, idempotency_key, request_hash, correlation_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`, [
        input.warehouseId, input.skuId, input.supplierId, normalized.leadTimeDays,
        normalized.safetyStockQuantity, normalized.coverageDays, normalized.salesWindowDays,
        normalized.orderMultiple, normalized.minimumStockQuantity ?? null,
        normalized.maximumStockQuantity ?? null, normalized.validFrom, normalized.validUntil ?? null,
        actorId, idempotencyKey, requestHash, correlationId
      ]);
      const policy = inserted.rows[0];
      if (!policy) throw new Error('Failed to create reorder policy');
      await client.query(`
        INSERT INTO audit.audit_event (
          actor_id, action, resource_type, resource_id, warehouse_id, correlation_id, after_data
        ) VALUES ($1,'CREATE','REORDER_POLICY',$2,$3,$4,$5::jsonb)`,
      [actorId, policy.id, input.warehouseId, correlationId, JSON.stringify(normalized)]);
      return { ...this.policyResponse(policy), replayed: false };
    });
  }

  async listPolicies(actorId: string, warehouseId: string, businessDate?: string) {
    await this.requireAccess(actorId, 'PLANNING.VIEW', warehouseId);
    const effectiveDate = businessDate ? dateOnly(businessDate, 'businessDate') : new Date().toISOString().slice(0, 10);
    const rows = await this.db.query<PolicyRow>(`
      SELECT * FROM planning.reorder_policy
      WHERE warehouse_id = $1
        AND valid_from <= $2::date AND (valid_until IS NULL OR valid_until > $2::date)
      ORDER BY sku_id, valid_from DESC`, [warehouseId, effectiveDate]);
    return rows.map((row) => this.policyResponse(row));
  }

  async deactivatePolicy(actorId: string, policyId: string, reason: string, correlationId: string) {
    if (!reason.trim()) throw new ConflictException('A reason is required');
    return this.db.transaction(async (client) => {
      const found = await client.query<PolicyRow>('SELECT * FROM planning.reorder_policy WHERE id = $1 FOR UPDATE', [policyId]);
      const policy = found.rows[0];
      if (!policy) throw new NotFoundException('Reorder policy not found');
      if (!await this.db.hasAccess(actorId, 'PLANNING.CONFIGURE', policy.warehouse_id, client)) {
        throw new ForbiddenException('PLANNING.CONFIGURE is required for the warehouse scope');
      }
      if (policy.status === 'INACTIVE') return { id: policy.id, status: 'INACTIVE', replayed: true };
      await client.query(`UPDATE planning.reorder_policy SET status='INACTIVE',updated_at=now() WHERE id=$1`, [policyId]);
      await client.query(`
        INSERT INTO audit.audit_event (
          actor_id, action, resource_type, resource_id, warehouse_id, correlation_id, reason,
          before_data, after_data
        ) VALUES ($1,'DEACTIVATE','REORDER_POLICY',$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [actorId, policy.id, policy.warehouse_id, correlationId, reason.trim(),
        JSON.stringify({ status: policy.status }), JSON.stringify({ status: 'INACTIVE' })]);
      return { id: policy.id, status: 'INACTIVE', replayed: false };
    });
  }

  async run(
    actorId: string,
    warehouseId: string,
    businessDateInput: string,
    idempotencyKey: string,
    correlationId: string
  ) {
    const businessDate = dateOnly(businessDateInput, 'businessDate');
    const requestHash = stableHash({ warehouseId, businessDate });
    return this.db.transaction(async (client) => {
      if (!await this.db.hasAccess(actorId, 'PLANNING.RUN', warehouseId, client)) {
        throw new ForbiddenException('PLANNING.RUN is required for the warehouse scope');
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`PHASE9_ROP:${warehouseId}:${businessDate}`]);
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM planning.replenishment_run WHERE warehouse_id=$1 AND business_date=$2',
        [warehouseId, businessDate]
      );
      if (existing.rows[0]) return this.getRunWithClient(client, existing.rows[0].id, true);
      const keyReplay = await client.query<{ id: string; request_hash: string }>(
        'SELECT id,request_hash FROM planning.replenishment_run WHERE executed_by=$1 AND idempotency_key=$2',
        [actorId, idempotencyKey]
      );
      if (keyReplay.rows[0]) {
        if (keyReplay.rows[0].request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return this.getRunWithClient(client, keyReplay.rows[0].id, true);
      }
      const runInsert = await client.query<{ id: string }>(`
        INSERT INTO planning.replenishment_run (
          warehouse_id,business_date,executed_by,idempotency_key,request_hash,correlation_id
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [warehouseId, businessDate, actorId, idempotencyKey, requestHash, correlationId]);
      const runId = runInsert.rows[0]?.id;
      if (!runId) throw new Error('Failed to create replenishment run');
      const policies = await client.query<PolicyRow>(`
        SELECT * FROM planning.reorder_policy
        WHERE warehouse_id=$1 AND status='ACTIVE' AND valid_from <= $2::date
          AND (valid_until IS NULL OR valid_until > $2::date)
        ORDER BY sku_id`, [warehouseId, businessDate]);
      let suggestionCount = 0;
      for (const policy of policies.rows) {
        const metrics = await client.query<{
          sellable_on_hand: string; active_reservation: string; atp: string;
          sales_quantity: string; reliable_inbound: string;
        }>(`
          SELECT
            coalesce(atp.sellable_on_hand,0)::bigint AS sellable_on_hand,
            coalesce(atp.active_reservation,0)::bigint AS active_reservation,
            coalesce(atp.atp,0)::bigint AS atp,
            coalesce((
              SELECT sum(issue_line.quantity)::bigint
              FROM outbound.goods_issue issue
              JOIN outbound.issue_request request ON request.id=issue.issue_request_id
              JOIN outbound.goods_issue_line issue_line ON issue_line.goods_issue_id=issue.id
              WHERE issue.status='POSTED' AND request.warehouse_id=$1 AND issue_line.sku_id=$2
                AND issue.posted_at >= $3::date - ($4::text || ' days')::interval
                AND issue.posted_at < $3::date + interval '1 day'
            ),0)::bigint AS sales_quantity,
            coalesce((
              SELECT sum(greatest(po_line.ordered_qty-po_line.received_qty,0))::bigint
              FROM purchasing.purchase_order po
              JOIN purchasing.purchase_order_line po_line ON po_line.po_id=po.id
              WHERE po.supplier_id=$5 AND po_line.sku_id=$2
                AND po.status IN ('SENT','PARTIALLY_RECEIVED')
                AND po.expected_delivery_date < $3::date + ($6::text || ' days')::interval + interval '1 day'
            ),0)::bigint AS reliable_inbound
          FROM (SELECT 1) seed
          LEFT JOIN inventory.atp_by_sku_warehouse atp ON atp.warehouse_id=$1 AND atp.sku_id=$2`,
        [warehouseId, policy.sku_id, businessDate, policy.sales_window_days, policy.supplier_id, policy.coverage_days]);
        const metric = metrics.rows[0];
        if (!metric) throw new Error('Failed to calculate replenishment metrics');
        const sellableOnHand = asNumber(metric.sellable_on_hand);
        const activeReservation = asNumber(metric.active_reservation);
        const atp = asNumber(metric.atp);
        const salesQuantity = asNumber(metric.sales_quantity);
        const reliableInbound = asNumber(metric.reliable_inbound);
        const averageDailySales = salesQuantity / policy.sales_window_days;
        const leadTimeDemand = Math.ceil(averageDailySales * policy.lead_time_days);
        const safetyStock = asNumber(policy.safety_stock_quantity);
        const reorderPoint = leadTimeDemand + safetyStock;
        const coverageDemand = Math.ceil(averageDailySales * policy.coverage_days);
        const rawSuggestion = Math.max(coverageDemand + safetyStock - atp - reliableInbound, 0);
        const orderMultiple = asNumber(policy.order_multiple);
        const suggestedQuantity = rawSuggestion === 0 ? 0 : Math.ceil(rawSuggestion / orderMultiple) * orderMultiple;
        const explanation = {
          formula: 'max(coverageDemand + safetyStock - ATP - reliableInbound, 0), rounded up to orderMultiple',
          ropFormula: 'ceil(averageDailySales * leadTimeDays) + safetyStock',
          businessDate, salesWindowDays: policy.sales_window_days, leadTimeDays: policy.lead_time_days,
          coverageDays: policy.coverage_days, orderMultiple
        };
        const resultInsert = await client.query<{ id: string }>(`
          INSERT INTO planning.replenishment_result (
            replenishment_run_id,reorder_policy_id,warehouse_id,sku_id,supplier_id,
            sellable_on_hand,active_reservation,atp,reliable_inbound,sales_quantity,sales_window_days,
            average_daily_sales,lead_time_demand,safety_stock_quantity,reorder_point,coverage_demand,
            raw_suggestion_quantity,suggested_quantity,order_multiple,explanation
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)
          RETURNING id`, [runId, policy.id, warehouseId, policy.sku_id, policy.supplier_id,
          sellableOnHand, activeReservation, atp, reliableInbound, salesQuantity, policy.sales_window_days,
          averageDailySales.toFixed(4), leadTimeDemand, safetyStock, reorderPoint, coverageDemand,
          rawSuggestion, suggestedQuantity, orderMultiple, JSON.stringify(explanation)]);
        const resultId = resultInsert.rows[0]?.id;
        if (!resultId) throw new Error('Failed to save replenishment result');
        if (atp < reorderPoint && suggestedQuantity > 0) {
          const draftCode = `DPR-${businessDate.replaceAll('-', '')}-${randomUUID().slice(0, 8)}`.toUpperCase();
          const snapshot = {
            sellableOnHand, activeReservation, atp, reliableInbound, salesQuantity,
            averageDailySales: Number(averageDailySales.toFixed(4)), leadTimeDemand,
            safetyStock, reorderPoint, coverageDemand, rawSuggestion, suggestedQuantity,
            orderMultiple, policyId: policy.id, businessDate
          };
          const draft = await client.query<{ id: string }>(`
            INSERT INTO planning.draft_purchase_request (
              draft_code,replenishment_result_id,warehouse_id,sku_id,supplier_id,suggestion_date,
              requested_quantity,reason,input_snapshot,created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
            ON CONFLICT (warehouse_id,sku_id,suggestion_date) DO NOTHING RETURNING id`,
          [draftCode, resultId, warehouseId, policy.sku_id, policy.supplier_id, businessDate,
            suggestedQuantity, `ATP ${atp} is below ROP ${reorderPoint}`, JSON.stringify(snapshot), actorId]);
          if (draft.rows[0]) suggestionCount += 1;
        }
      }
      await client.query(`
        UPDATE planning.replenishment_run SET policy_count=$2,suggestion_count=$3 WHERE id=$1`,
      [runId, policies.rowCount, suggestionCount]);
      await client.query(`
        INSERT INTO audit.audit_event (
          actor_id,action,resource_type,resource_id,warehouse_id,correlation_id,after_data
        ) VALUES ($1,'RUN','REPLENISHMENT_RUN',$2,$3,$4,$5::jsonb)`,
      [actorId, runId, warehouseId, correlationId, JSON.stringify({ businessDate, policyCount: policies.rowCount, suggestionCount })]);
      await client.query(`
        INSERT INTO platform.outbox_event (aggregate_type,aggregate_id,event_type,payload,correlation_id)
        VALUES ('REPLENISHMENT_RUN',$1,'REPLENISHMENT_RUN_COMPLETED',$2::jsonb,$3)`,
      [runId, JSON.stringify({ runId, warehouseId, businessDate, suggestionCount }), correlationId]);
      return this.getRunWithClient(client, runId, false);
    });
  }

  async getRun(actorId: string, runId: string) {
    const header = await this.db.query<{ warehouse_id: string }>(
      'SELECT warehouse_id FROM planning.replenishment_run WHERE id=$1', [runId]
    );
    if (!header[0]) throw new NotFoundException('Replenishment run not found');
    const warehouseId = header[0]?.warehouse_id;
    if (!warehouseId) throw new NotFoundException('Replenishment run not found');
    await this.requireAccess(actorId, 'PLANNING.VIEW', warehouseId);
    return this.db.transaction((client) => this.getRunWithClient(client, runId, false));
  }

  private async getRunWithClient(client: import('pg').PoolClient, runId: string, replayed: boolean) {
    const headerResult = await client.query<{
      id: string; warehouse_id: string; business_date: string; status: string;
      policy_count: number; suggestion_count: number; executed_by: string; correlation_id: string; created_at: string;
    }>('SELECT * FROM planning.replenishment_run WHERE id=$1', [runId]);
    const header = headerResult.rows[0];
    if (!header) throw new NotFoundException('Replenishment run not found');
    const results = await client.query<{
      id: string; reorder_policy_id: string; sku_id: string; supplier_id: string;
      sellable_on_hand: string; active_reservation: string; atp: string; reliable_inbound: string;
      sales_quantity: string; average_daily_sales: string; lead_time_demand: string;
      safety_stock_quantity: string; reorder_point: string; coverage_demand: string;
      raw_suggestion_quantity: string; suggested_quantity: string; order_multiple: string; explanation: unknown;
    }>('SELECT * FROM planning.replenishment_result WHERE replenishment_run_id=$1 ORDER BY sku_id', [runId]);
    const drafts = await client.query<{
      id: string; draft_code: string; sku_id: string; supplier_id: string;
      requested_quantity: string; status: string; reason: string; input_snapshot: unknown;
    }>(`
      SELECT draft.* FROM planning.draft_purchase_request draft
      JOIN planning.replenishment_result result ON result.id=draft.replenishment_result_id
      WHERE result.replenishment_run_id=$1 ORDER BY draft.sku_id`, [runId]);
    return {
      id: header.id, warehouseId: header.warehouse_id, businessDate: header.business_date,
      status: header.status, policyCount: Number(header.policy_count), suggestionCount: Number(header.suggestion_count),
      executedBy: header.executed_by, correlationId: header.correlation_id, createdAt: header.created_at,
      results: results.rows.map((row) => ({
        id: row.id, policyId: row.reorder_policy_id, skuId: row.sku_id, supplierId: row.supplier_id,
        sellableOnHand: asNumber(row.sellable_on_hand), activeReservation: asNumber(row.active_reservation),
        atp: asNumber(row.atp), reliableInbound: asNumber(row.reliable_inbound), salesQuantity: asNumber(row.sales_quantity),
        averageDailySales: Number(row.average_daily_sales), leadTimeDemand: asNumber(row.lead_time_demand),
        safetyStockQuantity: asNumber(row.safety_stock_quantity), reorderPoint: asNumber(row.reorder_point),
        coverageDemand: asNumber(row.coverage_demand), rawSuggestionQuantity: asNumber(row.raw_suggestion_quantity),
        suggestedQuantity: asNumber(row.suggested_quantity), orderMultiple: asNumber(row.order_multiple),
        explanation: row.explanation
      })),
      drafts: drafts.rows.map((row) => ({
        id: row.id, draftCode: row.draft_code, skuId: row.sku_id, supplierId: row.supplier_id,
        requestedQuantity: asNumber(row.requested_quantity), status: row.status, reason: row.reason,
        inputSnapshot: row.input_snapshot
      })),
      replayed
    };
  }

  private policyResponse(row: PolicyRow) {
    return {
      id: row.id, warehouseId: row.warehouse_id, skuId: row.sku_id, supplierId: row.supplier_id,
      leadTimeDays: Number(row.lead_time_days), safetyStockQuantity: asNumber(row.safety_stock_quantity),
      coverageDays: Number(row.coverage_days), salesWindowDays: Number(row.sales_window_days),
      orderMultiple: asNumber(row.order_multiple),
      minimumStockQuantity: row.minimum_stock_quantity === null ? null : asNumber(row.minimum_stock_quantity),
      maximumStockQuantity: row.maximum_stock_quantity === null ? null : asNumber(row.maximum_stock_quantity),
      validFrom: row.valid_from, validUntil: row.valid_until, status: row.status,
      createdBy: row.created_by, correlationId: row.correlation_id, createdAt: row.created_at
    };
  }
}
