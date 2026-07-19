import { ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ReportingDatabaseService } from './reporting-database.service.js';

type ReportType = 'DASHBOARD' | 'INVENTORY_ACTIVITY' | 'QUALITY_RECALL' | 'SUPPLIER_KPI' | 'INVENTORY_VALUE';

function validDate(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ConflictException(`${name} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function dateRange(from: string, to: string): { from: string; to: string } {
  const normalized = { from: validDate(from, 'from'), to: validDate(to, 'to') };
  if (normalized.to < normalized.from) throw new ConflictException('to must not be earlier than from');
  const days = (Date.parse(`${normalized.to}T00:00:00Z`) - Date.parse(`${normalized.from}T00:00:00Z`)) / 86_400_000;
  if (days > 366) throw new ConflictException('Report date range cannot exceed 366 days');
  return normalized;
}

function number(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new ConflictException('Report contains an invalid numeric value');
  return parsed;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function daysBetween(start: string, end: string): number {
  return Number(((Date.parse(end) - Date.parse(start)) / 86_400_000).toFixed(2));
}

@Injectable()
export class ReportingService {
  constructor(private readonly db: ReportingDatabaseService) {}

  private async requireWarehouse(actorId: string, permission: string, warehouseId: string): Promise<void> {
    if (!await this.db.hasAccess(actorId, permission, warehouseId)) {
      throw new ForbiddenException(`${permission} is required for the warehouse scope`);
    }
  }

  private async requirePermission(actorId: string, permission: string): Promise<void> {
    if (!await this.db.hasPermission(actorId, permission)) throw new ForbiddenException(`${permission} is required`);
  }

  private async saveRun(
    actorId: string,
    reportType: ReportType,
    warehouseId: string | null,
    filters: Record<string, unknown>,
    result: unknown,
    sourceCutoff: string,
    correlationId: string
  ): Promise<string> {
    const rows = await this.db.query<{ id: string }>(`
      INSERT INTO reporting.report_run (
        report_type,warehouse_id,filters,result_snapshot,source_cutoff,created_by,correlation_id
      ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) RETURNING id`,
    [reportType, warehouseId, JSON.stringify(filters), JSON.stringify(result), sourceCutoff, actorId, correlationId]);
    const id = rows[0]?.id;
    if (!id) throw new Error('Failed to persist report snapshot');
    return id;
  }

  async dashboard(actorId: string, warehouseId: string, businessDateInput: string, correlationId: string) {
    const businessDate = validDate(businessDateInput, 'businessDate');
    await this.requireWarehouse(actorId, 'REPORTING.VIEW', warehouseId);
    const sourceCutoff = new Date().toISOString();
    const [inventoryRows, operationRows, planningRows, qualityRows, stocktakeRows, recallRows] = await Promise.all([
      this.db.query<{
        total_cases: string; available_cases: string; blocked_cases: string; quarantined_cases: string;
        damaged_cases: string; expired_cases: string; recalled_cases: string; near_expiry_cases: string;
      }>(`
        SELECT coalesce(sum(quantity_on_hand),0)::bigint AS total_cases,
          coalesce(sum(quantity_on_hand) FILTER (WHERE stock_status='AVAILABLE'),0)::bigint AS available_cases,
          coalesce(sum(quantity_on_hand) FILTER (WHERE stock_status='BLOCKED'),0)::bigint AS blocked_cases,
          coalesce(sum(quantity_on_hand) FILTER (WHERE stock_status='QUARANTINED'),0)::bigint AS quarantined_cases,
          coalesce(sum(quantity_on_hand) FILTER (WHERE stock_status='DAMAGED'),0)::bigint AS damaged_cases,
          coalesce(sum(quantity_on_hand) FILTER (WHERE stock_status='EXPIRED'),0)::bigint AS expired_cases,
          coalesce(sum(quantity_on_hand) FILTER (WHERE stock_status='RECALLED'),0)::bigint AS recalled_cases,
          coalesce(sum(quantity_on_hand) FILTER (
            WHERE expiration_date >= $2::date AND expiration_date < $2::date + interval '30 days'
          ),0)::bigint AS near_expiry_cases
        FROM reporting.inventory_position WHERE warehouse_id=$1`, [warehouseId, businessDate]),
      this.db.query<{ late_po_count: string; open_transfer_count: string }>(`
        SELECT
          (SELECT count(DISTINCT po.id)::bigint
           FROM purchasing.purchase_order po
           JOIN purchasing.purchase_order_line line ON line.po_id=po.id
           JOIN planning.reorder_policy policy ON policy.supplier_id=po.supplier_id AND policy.sku_id=line.sku_id
             AND policy.warehouse_id=$1 AND policy.status='ACTIVE'
           WHERE po.status IN ('APPROVED','SENT','PARTIALLY_RECEIVED') AND po.expected_delivery_date < $2::date
          ) AS late_po_count,
          (SELECT count(*)::bigint FROM transfer.stock_transfer
           WHERE (source_warehouse_id=$1 OR destination_warehouse_id=$1)
             AND status NOT IN ('CLOSED','CANCELLED','REVERSED')) AS open_transfer_count`, [warehouseId, businessDate]),
      this.db.query<{ below_rop_count: string; draft_pr_count: string }>(`
        SELECT
          (SELECT count(*)::bigint FROM planning.reorder_policy policy
           LEFT JOIN inventory.atp_by_sku_warehouse atp
             ON atp.warehouse_id=policy.warehouse_id AND atp.sku_id=policy.sku_id
           LEFT JOIN LATERAL (
             SELECT result.reorder_point FROM planning.replenishment_result result
             WHERE result.reorder_policy_id=policy.id ORDER BY result.created_at DESC LIMIT 1
           ) latest ON true
           WHERE policy.warehouse_id=$1 AND policy.status='ACTIVE'
             AND policy.valid_from <= $2::date AND (policy.valid_until IS NULL OR policy.valid_until > $2::date)
             AND coalesce(atp.atp,0) < coalesce(latest.reorder_point,policy.safety_stock_quantity)) AS below_rop_count,
          (SELECT count(*)::bigint FROM planning.draft_purchase_request
           WHERE warehouse_id=$1 AND status='DRAFT') AS draft_pr_count`, [warehouseId, businessDate]),
      this.db.query<{ open_quality_count: string; pending_return_count: string }>(`
        SELECT
          (SELECT count(*)::bigint FROM quality.quality_case
           WHERE warehouse_id=$1 AND status IN ('DRAFT','CONTAINED','PENDING_DISPOSITION')) AS open_quality_count,
          (SELECT count(*)::bigint FROM quality.customer_return
           WHERE warehouse_id=$1 AND status IN ('DRAFT','APPROVED','POSTED')) AS pending_return_count`, [warehouseId]),
      this.db.query<{ pending_stocktake_count: string; variance_cases: string }>(`
        SELECT count(*) FILTER (WHERE session.status IN ('RECONCILED','PENDING_APPROVAL'))::bigint AS pending_stocktake_count,
          coalesce(sum(abs(coalesce(adjustment_line.variance_quantity,0))),0)::bigint AS variance_cases
        FROM stocktake.stocktake_session session
        LEFT JOIN adjustment.inventory_adjustment adjustment ON adjustment.stocktake_session_id=session.id
        LEFT JOIN adjustment.inventory_adjustment_line adjustment_line ON adjustment_line.inventory_adjustment_id=adjustment.id
        WHERE session.warehouse_id=$1`, [warehouseId]),
      this.db.query<{ active_recall_count: string }>(`
        SELECT count(DISTINCT recall_case.id)::bigint AS active_recall_count
        FROM recall.recall_case recall_case
        JOIN recall.recall_scope scope ON scope.recall_case_id=recall_case.id
        WHERE scope.warehouse_id=$1 AND recall_case.status IN ('APPROVED','CONTAINED')`, [warehouseId])
    ]);
    const inventory = inventoryRows[0];
    const operation = operationRows[0];
    const planning = planningRows[0];
    const quality = qualityRows[0];
    const stocktake = stocktakeRows[0];
    const recall = recallRows[0];
    const result = {
      warehouseId, businessDate,
      inventory: {
        totalCases: number(inventory?.total_cases), availableCases: number(inventory?.available_cases),
        blockedCases: number(inventory?.blocked_cases), quarantinedCases: number(inventory?.quarantined_cases),
        damagedCases: number(inventory?.damaged_cases), expiredCases: number(inventory?.expired_cases),
        recalledCases: number(inventory?.recalled_cases), nearExpiryCases: number(inventory?.near_expiry_cases)
      },
      alerts: {
        belowRop: number(planning?.below_rop_count), draftPurchaseRequests: number(planning?.draft_pr_count),
        latePurchaseOrders: number(operation?.late_po_count), openTransfers: number(operation?.open_transfer_count),
        pendingStocktakes: number(stocktake?.pending_stocktake_count), stocktakeVarianceCases: number(stocktake?.variance_cases),
        openQualityCases: number(quality?.open_quality_count), pendingReturns: number(quality?.pending_return_count),
        activeRecalls: number(recall?.active_recall_count)
      }
    };
    const reportRunId = await this.saveRun(actorId, 'DASHBOARD', warehouseId, { businessDate }, result, sourceCutoff, correlationId);
    return { ...result, reportRunId, sourceCutoff };
  }

  async inventoryActivity(
    actorId: string,
    warehouseId: string,
    fromInput: string,
    toInput: string,
    correlationId: string,
    skuId?: string
  ) {
    const { from, to } = dateRange(fromInput, toInput);
    await this.requireWarehouse(actorId, 'REPORTING.VIEW', warehouseId);
    const sourceCutoff = new Date().toISOString();
    const rows = await this.db.query<{
      id: string; movement_type: string; document_type: string; document_id: string; sku_id: string;
      batch_id: string; quantity: string; source_warehouse_id: string | null; destination_warehouse_id: string | null;
      source_status: string | null; destination_status: string | null; actor_id: string; occurred_at: string;
    }>(`
      SELECT id,movement_type,document_type,document_id,sku_id,batch_id,quantity,
        source_warehouse_id,destination_warehouse_id,source_status,destination_status,actor_id,occurred_at
      FROM inventory.inventory_movement_ledger
      WHERE (source_warehouse_id=$1 OR destination_warehouse_id=$1)
        AND occurred_at >= $2::date AND occurred_at < $3::date + interval '1 day'
        AND ($4::uuid IS NULL OR sku_id=$4)
      ORDER BY occurred_at DESC,id DESC LIMIT 500`, [warehouseId, from, to, skuId ?? null]);
    const summary = new Map<string, { movementType: string; inboundCases: number; outboundCases: number; movementCount: number }>();
    for (const row of rows) {
      const current = summary.get(row.movement_type) ?? {
        movementType: row.movement_type, inboundCases: 0, outboundCases: 0, movementCount: 0
      };
      if (row.destination_warehouse_id === warehouseId) current.inboundCases += number(row.quantity);
      if (row.source_warehouse_id === warehouseId) current.outboundCases += number(row.quantity);
      current.movementCount += 1;
      summary.set(row.movement_type, current);
    }
    const result = {
      warehouseId, from, to, skuId: skuId ?? null, summary: [...summary.values()],
      movements: rows.map((row) => ({
        id: row.id, movementType: row.movement_type, documentType: row.document_type, documentId: row.document_id,
        skuId: row.sku_id, batchId: row.batch_id, quantity: number(row.quantity),
        sourceWarehouseId: row.source_warehouse_id, destinationWarehouseId: row.destination_warehouse_id,
        sourceStatus: row.source_status, destinationStatus: row.destination_status,
        actorId: row.actor_id, occurredAt: row.occurred_at
      }))
    };
    const reportRunId = await this.saveRun(
      actorId, 'INVENTORY_ACTIVITY', warehouseId, { from, to, skuId: skuId ?? null }, result, sourceCutoff, correlationId
    );
    return { ...result, reportRunId, sourceCutoff };
  }

  async qualityRecall(
    actorId: string,
    warehouseId: string,
    fromInput: string,
    toInput: string,
    correlationId: string
  ) {
    const { from, to } = dateRange(fromInput, toInput);
    await this.requireWarehouse(actorId, 'REPORTING.VIEW', warehouseId);
    const sourceCutoff = new Date().toISOString();
    const [caseRows, dispositionRows, returnRows, recallRows] = await Promise.all([
      this.db.query<{ status: string; case_type: string; case_count: string; affected_cases: string }>(`
        SELECT quality_case.status,quality_case.case_type,count(DISTINCT quality_case.id)::bigint AS case_count,
          coalesce(sum(line.quantity),0)::bigint AS affected_cases
        FROM quality.quality_case quality_case
        LEFT JOIN quality.quality_case_line line ON line.quality_case_id=quality_case.id
        WHERE quality_case.warehouse_id=$1 AND quality_case.created_at >= $2::date
          AND quality_case.created_at < $3::date + interval '1 day'
        GROUP BY quality_case.status,quality_case.case_type ORDER BY quality_case.case_type,quality_case.status`,
      [warehouseId, from, to]),
      this.db.query<{ disposition_type: string; status: string; quantity: string }>(`
        SELECT disposition.disposition_type,disposition.status,coalesce(sum(line.quantity),0)::bigint AS quantity
        FROM quality.quality_disposition disposition
        JOIN quality.quality_case quality_case ON quality_case.id=disposition.quality_case_id
        LEFT JOIN quality.quality_disposition_line line ON line.quality_disposition_id=disposition.id
        WHERE quality_case.warehouse_id=$1 AND disposition.created_at >= $2::date
          AND disposition.created_at < $3::date + interval '1 day'
        GROUP BY disposition.disposition_type,disposition.status ORDER BY disposition.disposition_type`,
      [warehouseId, from, to]),
      this.db.query<{ status: string; return_count: string; quantity: string }>(`
        SELECT customer_return.status,count(DISTINCT customer_return.id)::bigint AS return_count,
          coalesce(sum(line.quantity),0)::bigint AS quantity
        FROM quality.customer_return customer_return
        LEFT JOIN quality.customer_return_line line ON line.customer_return_id=customer_return.id
        WHERE customer_return.warehouse_id=$1 AND customer_return.created_at >= $2::date
          AND customer_return.created_at < $3::date + interval '1 day'
        GROUP BY customer_return.status ORDER BY customer_return.status`, [warehouseId, from, to]),
      this.db.query<{ status: string; severity: string; recall_count: string; contained_cases: string }>(`
        SELECT recall_case.status,recall_case.severity,count(DISTINCT recall_case.id)::bigint AS recall_count,
          coalesce(sum(balance.quantity_on_hand) FILTER (WHERE balance.stock_status='RECALLED'),0)::bigint AS contained_cases
        FROM recall.recall_case recall_case
        JOIN recall.recall_scope scope ON scope.recall_case_id=recall_case.id AND scope.warehouse_id=$1
        LEFT JOIN inventory.inventory_balance balance ON balance.batch_id=recall_case.batch_id AND balance.warehouse_id=$1
        WHERE recall_case.created_at >= $2::date AND recall_case.created_at < $3::date + interval '1 day'
        GROUP BY recall_case.status,recall_case.severity ORDER BY recall_case.severity,recall_case.status`,
      [warehouseId, from, to])
    ]);
    const result = {
      warehouseId, from, to,
      qualityCases: caseRows.map((row) => ({
        status: row.status, caseType: row.case_type,
        caseCount: number(row.case_count), affectedCases: number(row.affected_cases)
      })),
      dispositions: dispositionRows.map((row) => ({ dispositionType: row.disposition_type, status: row.status, quantity: number(row.quantity) })),
      returns: returnRows.map((row) => ({ status: row.status, returnCount: number(row.return_count), quantity: number(row.quantity) })),
      recalls: recallRows.map((row) => ({ status: row.status, severity: row.severity, recallCount: number(row.recall_count), containedCases: number(row.contained_cases) }))
    };
    const reportRunId = await this.saveRun(
      actorId, 'QUALITY_RECALL', warehouseId, { from, to }, result, sourceCutoff, correlationId
    );
    return { ...result, reportRunId, sourceCutoff };
  }

  async inventoryValue(actorId: string, warehouseId: string, correlationId: string, skuId?: string) {
    await this.requireWarehouse(actorId, 'REPORTING.VIEW_COST', warehouseId);
    const sourceCutoff = new Date().toISOString();
    const rows = await this.db.query<{
      sku_id: string; sku_code: string; sku_name: string; batch_id: string; batch_code: string;
      stock_status: string; quantity_on_hand: string; unit_cost: string; inventory_value: string; valuation_status: string;
    }>(`
      SELECT sku_id,sku_code,sku_name,batch_id,batch_code,stock_status,
        sum(quantity_on_hand)::bigint AS quantity_on_hand,
        unit_cost,sum(inventory_value)::numeric(24,4) AS inventory_value,valuation_status
      FROM reporting.inventory_value_current
      WHERE warehouse_id=$1 AND ($2::uuid IS NULL OR sku_id=$2) AND quantity_on_hand > 0
      GROUP BY sku_id,sku_code,sku_name,batch_id,batch_code,stock_status,unit_cost,valuation_status
      ORDER BY sku_code,batch_code,stock_status`, [warehouseId, skuId ?? null]);
    const items = rows.map((row) => ({
      skuId: row.sku_id, skuCode: row.sku_code, skuName: row.sku_name,
      batchId: row.batch_id, batchCode: row.batch_code, stockStatus: row.stock_status,
      quantityOnHand: number(row.quantity_on_hand), unitCost: number(row.unit_cost),
      inventoryValue: number(row.inventory_value), valuationStatus: row.valuation_status
    }));
    const result = {
      warehouseId, skuId: skuId ?? null,
      totalValue: Number(items.reduce((sum, item) => sum + item.inventoryValue, 0).toFixed(4)),
      valuedCases: items.filter((item) => item.valuationStatus === 'VALUED').reduce((sum, item) => sum + item.quantityOnHand, 0),
      unvaluedCases: items.filter((item) => item.valuationStatus === 'UNVALUED').reduce((sum, item) => sum + item.quantityOnHand, 0),
      items
    };
    const reportRunId = await this.saveRun(
      actorId, 'INVENTORY_VALUE', warehouseId, { skuId: skuId ?? null }, result, sourceCutoff, correlationId
    );
    return { ...result, reportRunId, sourceCutoff };
  }

  async supplierKpi(
    actorId: string,
    supplierId: string,
    fromInput: string,
    toInput: string,
    timezone: string,
    correlationId: string
  ) {
    const { from, to } = dateRange(fromInput, toInput);
    await this.requirePermission(actorId, 'REPORTING.VIEW');
    if (!timezone.trim()) throw new ConflictException('timezone is required');
    const timezoneCheck = await this.db.query<{ valid: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=$1) AS valid', [timezone]
    );
    if (!timezoneCheck[0]?.valid) throw new ConflictException('Unknown IANA timezone');
    const supplier = await this.db.query<{ id: string; code: string; name: string }>(
      'SELECT id,code,name FROM purchasing.supplier WHERE id=$1', [supplierId]
    );
    if (!supplier[0]) throw new NotFoundException('Supplier not found');
    const sourceCutoff = new Date().toISOString();
    const rows = await this.db.query<{
      po_id: string; po_code: string; order_date: string; expected_delivery_date: string;
      po_line_id: string; sku_id: string; ordered_qty: string; receipt_id: string | null;
      received_date: string | null; received_qty: string | null; stock_status: string | null;
    }>(`
      SELECT po.id AS po_id,po.po_code,po.order_date,po.expected_delivery_date,
        line.id AS po_line_id,line.sku_id,line.ordered_qty,
        receipt.id AS receipt_id,receipt.received_date,receipt_line.quantity AS received_qty,receipt_line.stock_status
      FROM purchasing.purchase_order po
      JOIN purchasing.purchase_order_line line ON line.po_id=po.id
      LEFT JOIN receiving.goods_receipt_line receipt_line ON receipt_line.po_line_id=line.id
      LEFT JOIN receiving.goods_receipt receipt ON receipt.id=receipt_line.gr_id AND receipt.status='POSTED'
      WHERE po.supplier_id=$1 AND po.status <> 'CANCELLED'
        AND (po.expected_delivery_date AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      ORDER BY po.expected_delivery_date,line.id,receipt.received_date`, [supplierId, from, to, timezone]);
    const grouped = new Map<string, {
      poId: string; poCode: string; poLineId: string; skuId: string; orderDate: string;
      promiseDate: string; orderedQuantity: number; receipts: Array<{ id: string; at: string; quantity: number; status: string }>;
    }>();
    for (const row of rows) {
      const current = grouped.get(row.po_line_id) ?? {
        poId: row.po_id, poCode: row.po_code, poLineId: row.po_line_id, skuId: row.sku_id,
        orderDate: row.order_date, promiseDate: row.expected_delivery_date,
        orderedQuantity: number(row.ordered_qty), receipts: []
      };
      if (row.receipt_id && row.received_date && row.received_qty && row.stock_status) {
        current.receipts.push({ id: row.receipt_id, at: row.received_date, quantity: number(row.received_qty), status: row.stock_status });
      }
      grouped.set(row.po_line_id, current);
    }
    const drilldown = [...grouped.values()].map((line) => {
      const orderedReceipts = [...line.receipts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const promiseAt = Date.parse(line.promiseDate);
      const acceptedByPromise = orderedReceipts.filter((receipt) => Date.parse(receipt.at) <= promiseAt)
        .reduce((sum, receipt) => sum + receipt.quantity, 0);
      const acceptedTotal = orderedReceipts.reduce((sum, receipt) => sum + receipt.quantity, 0);
      const damagedQuantity = orderedReceipts.filter((receipt) => receipt.status === 'DAMAGED')
        .reduce((sum, receipt) => sum + receipt.quantity, 0);
      const firstReceiptAt = orderedReceipts[0]?.at ?? null;
      let cumulative = 0;
      let completeReceiptAt: string | null = null;
      for (const receipt of orderedReceipts) {
        cumulative += receipt.quantity;
        if (cumulative >= line.orderedQuantity) { completeReceiptAt = receipt.at; break; }
      }
      return {
        ...line, receipts: orderedReceipts, acceptedByPromise, acceptedTotal,
        fillRatePercent: percent(Math.min(acceptedByPromise, line.orderedQuantity), line.orderedQuantity),
        overReceiptQuantity: Math.max(acceptedTotal - line.orderedQuantity, 0),
        damagedQuantity, onTime: acceptedByPromise >= line.orderedQuantity,
        firstReceiptAt, completeReceiptAt,
        firstReceiptLeadTimeDays: firstReceiptAt ? daysBetween(`${line.orderDate}T00:00:00Z`, firstReceiptAt) : null,
        completeReceiptLeadTimeDays: completeReceiptAt ? daysBetween(`${line.orderDate}T00:00:00Z`, completeReceiptAt) : null
      };
    });
    const returnRows = await this.db.query<{ returned_quantity: string }>(`
      SELECT coalesce(sum(disposition_line.quantity),0)::bigint AS returned_quantity
      FROM quality.quality_disposition disposition
      JOIN quality.quality_case quality_case ON quality_case.id=disposition.quality_case_id
      JOIN quality.quality_disposition_line disposition_line ON disposition_line.quality_disposition_id=disposition.id
      JOIN quality.quality_case_line case_line ON case_line.id=disposition_line.quality_case_line_id
      WHERE disposition.disposition_type='RETURN_TO_SUPPLIER' AND disposition.status='POSTED'
        AND disposition.posted_at >= $2::date AND disposition.posted_at < $3::date + interval '1 day'
        AND EXISTS (
          SELECT 1 FROM receiving.goods_receipt_line receipt_line
          JOIN purchasing.purchase_order_line po_line ON po_line.id=receipt_line.po_line_id
          JOIN purchasing.purchase_order po ON po.id=po_line.po_id
          WHERE receipt_line.batch_id=case_line.batch_id AND po.supplier_id=$1
        )`, [supplierId, from, to]);
    const scheduleCount = drilldown.length;
    const onTimeCount = drilldown.filter((line) => line.onTime).length;
    const totalOrdered = drilldown.reduce((sum, line) => sum + line.orderedQuantity, 0);
    const acceptedByPromise = drilldown.reduce((sum, line) => sum + Math.min(line.acceptedByPromise, line.orderedQuantity), 0);
    const acceptedTotal = drilldown.reduce((sum, line) => sum + line.acceptedTotal, 0);
    const damageQuantity = drilldown.reduce((sum, line) => sum + line.damagedQuantity, 0);
    const returnedQuantity = number(returnRows[0]?.returned_quantity);
    const firstLeadTimes = drilldown.flatMap((line) => line.firstReceiptLeadTimeDays === null ? [] : [line.firstReceiptLeadTimeDays]);
    const completeLeadTimes = drilldown.flatMap((line) => line.completeReceiptLeadTimeDays === null ? [] : [line.completeReceiptLeadTimeDays]);
    const result = {
      supplier: supplier[0], period: { from, to, timezone }, methodology: {
        scheduleUnit: 'PO line', cancelledPoExcluded: true, partialReceipt: 'cumulative accepted quantity',
        promiseBoundary: 'expected_delivery_date in selected IANA timezone',
        fillRateCap: 'min(accepted by promise, ordered) / ordered'
      },
      kpi: {
        scheduleCount, onTimeCount, otdPercent: percent(onTimeCount, scheduleCount),
        averageFirstReceiptLeadTimeDays: firstLeadTimes.length === 0 ? 0 : Number((firstLeadTimes.reduce((a, b) => a + b, 0) / firstLeadTimes.length).toFixed(2)),
        averageCompleteReceiptLeadTimeDays: completeLeadTimes.length === 0 ? 0 : Number((completeLeadTimes.reduce((a, b) => a + b, 0) / completeLeadTimes.length).toFixed(2)),
        fillRatePercent: percent(acceptedByPromise, totalOrdered),
        overReceiptQuantity: drilldown.reduce((sum, line) => sum + line.overReceiptQuantity, 0),
        damageRatePercent: percent(damageQuantity, acceptedTotal),
        returnRatePercent: percent(returnedQuantity, acceptedTotal),
        returnedQuantity, acceptedQuantity: acceptedTotal
      },
      drilldown
    };
    const reportRunId = await this.saveRun(
      actorId, 'SUPPLIER_KPI', null, { supplierId, from, to, timezone }, result, sourceCutoff, correlationId
    );
    return { ...result, reportRunId, sourceCutoff };
  }

  async createExport(actorId: string, reportRunId: string, correlationId: string) {
    const runs = await this.db.query<{
      id: string; report_type: string; warehouse_id: string | null; result_snapshot: unknown; source_cutoff: string;
    }>('SELECT id,report_type,warehouse_id,result_snapshot,source_cutoff FROM reporting.report_run WHERE id=$1', [reportRunId]);
    const run = runs[0];
    if (!run) throw new NotFoundException('Report run not found');
    if (run.warehouse_id) await this.requireWarehouse(actorId, 'REPORTING.EXPORT', run.warehouse_id);
    else await this.requirePermission(actorId, 'REPORTING.EXPORT');
    const existing = await this.db.query<{
      id: string; status: string; file_name: string; content_type: string; expires_at: string;
    }>('SELECT id,status,file_name,content_type,expires_at FROM reporting.report_export WHERE report_run_id=$1', [reportRunId]);
    if (existing[0]) return { ...existing[0], replayed: true };
    const fileName = `${run.report_type.toLowerCase()}-${reportRunId}.json`;
    const inserted = await this.db.query<{
      id: string; status: string; file_name: string; content_type: string; expires_at: string;
    }>(`
      INSERT INTO reporting.report_export (report_run_id,file_name,content,created_by,correlation_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id,status,file_name,content_type,expires_at`,
    [reportRunId, fileName, JSON.stringify({ sourceCutoff: run.source_cutoff, data: run.result_snapshot }, null, 2), actorId, correlationId]);
    const exported = inserted[0];
    if (!exported) throw new Error('Failed to create report export');
    await this.db.query(`
      INSERT INTO audit.audit_event (actor_id,action,resource_type,resource_id,warehouse_id,correlation_id,after_data)
      VALUES ($1,'EXPORT','REPORT_RUN',$2,$3,$4,$5::jsonb)`,
    [actorId, reportRunId, run.warehouse_id, correlationId, JSON.stringify({ exportId: exported.id, fileName })]);
    return { ...exported, replayed: false };
  }

  async getExport(actorId: string, exportId: string) {
    const rows = await this.db.query<{
      id: string; report_run_id: string; warehouse_id: string | null; status: string;
      file_name: string; content_type: string; content: string; expires_at: string;
    }>(`
      SELECT export.id,export.report_run_id,run.warehouse_id,export.status,export.file_name,
        export.content_type,export.content,export.expires_at
      FROM reporting.report_export export
      JOIN reporting.report_run run ON run.id=export.report_run_id WHERE export.id=$1`, [exportId]);
    const exported = rows[0];
    if (!exported) throw new NotFoundException('Report export not found');
    if (exported.warehouse_id) await this.requireWarehouse(actorId, 'REPORTING.EXPORT', exported.warehouse_id);
    else await this.requirePermission(actorId, 'REPORTING.EXPORT');
    return {
      id: exported.id, reportRunId: exported.report_run_id, status: exported.status,
      fileName: exported.file_name, contentType: exported.content_type, content: exported.content,
      expiresAt: exported.expires_at
    };
  }
}
