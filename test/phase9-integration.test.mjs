import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { PlanningDatabaseService } from '../apps/api/dist/modules/planning/public/planning-database.service.js';
import { PlanningService } from '../apps/api/dist/modules/planning/public/planning.service.js';
import { ReportingDatabaseService } from '../apps/api/dist/modules/reporting/public/reporting-database.service.js';
import { ReportingService } from '../apps/api/dist/modules/reporting/public/reporting.service.js';
import { IntegrationDatabaseService } from '../apps/api/dist/modules/integration/public/integration-database.service.js';
import { IntegrationService } from '../apps/api/dist/modules/integration/public/integration.service.js';
import { DeliveryPublishError, processOutboxBatch } from '../apps/worker/dist/outbox-processor.js';

const { Client, Pool } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

test('Integration: Phase 9 ROP, supplier KPI, valuation and dead-letter replay', async () => {
  const client = new Client({ connectionString });
  const workerPool = new Pool({ connectionString });
  await client.connect();
  const planningDb = new PlanningDatabaseService();
  const reportingDb = new ReportingDatabaseService();
  const integrationDb = new IntegrationDatabaseService();
  const planning = new PlanningService(planningDb);
  const reporting = new ReportingService(reportingDb);
  const integration = new IntegrationService(integrationDb);
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
  const correlationId = randomUUID();
  const businessDate = '2026-07-20';

  try {
    const role = (await client.query(
      `INSERT INTO iam.role (code,name,is_system) VALUES ($1,$2,true) RETURNING id`,
      [`PHASE9_${suffix}`, 'Phase 9 integration role']
    )).rows[0];
    const actor = (await client.query(
      `INSERT INTO iam.app_user (username,display_name,role_id,password_hash)
       VALUES ($1,$2,$3,'test_hash') RETURNING id`,
      [`p9_${suffix.toLowerCase()}`, 'Phase 9 actor', role.id]
    )).rows[0];
    await client.query(
      `INSERT INTO iam.role_permission (role_id,permission_id,granted_by)
       SELECT $1,id,$2 FROM iam.permission
       WHERE code LIKE 'PLANNING.%' OR code LIKE 'REPORTING.%' OR code LIKE 'INTEGRATION.%'`,
      [role.id, actor.id]
    );
    const warehouse = (await client.query(
      `INSERT INTO warehouse.warehouse (code,name) VALUES ($1,$2) RETURNING id`,
      [`WH_${suffix}`, 'Phase 9 warehouse']
    )).rows[0];
    await client.query(
      `INSERT INTO iam.user_warehouse_scope (user_id,warehouse_id,valid_from) VALUES ($1,$2,now())`,
      [actor.id, warehouse.id]
    );
    const zone = (await client.query(
      `INSERT INTO warehouse.zone (warehouse_id,code,name,zone_type)
       VALUES ($1,$2,$3,'STORAGE') RETURNING id`,
      [warehouse.id, `Z_${suffix}`, 'Phase 9 storage']
    )).rows[0];
    const location = (await client.query(
      `INSERT INTO warehouse.location (zone_id,code,barcode,mixing_policy)
       VALUES ($1,$2,$3,'SINGLE_SKU') RETURNING id`,
      [zone.id, `L_${suffix}`, `BC-${suffix}`]
    )).rows[0];
    const uom = (await client.query(
      `INSERT INTO catalog.unit_of_measure (code,name) VALUES ('CASE','Case')
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`
    )).rows[0];
    const category = (await client.query(
      `INSERT INTO catalog.category (code,name) VALUES ($1,$2) RETURNING id`, [`CAT_${suffix}`, 'Phase 9 category']
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO catalog.product (code,name,category_id) VALUES ($1,$2,$3) RETURNING id`,
      [`PROD_${suffix}`, 'Phase 9 product', category.id]
    )).rows[0];
    const sku = (await client.query(
      `INSERT INTO catalog.sku (product_id,code,name,base_uom_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [product.id, `SKU_${suffix}`, 'Phase 9 SKU', uom.id]
    )).rows[0];
    const secondSku = (await client.query(
      `INSERT INTO catalog.sku (product_id,code,name,base_uom_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [product.id, `SKU2_${suffix}`, 'Phase 9 SKU 2', uom.id]
    )).rows[0];
    const supplier = (await client.query(
      `INSERT INTO purchasing.supplier (code,name,standard_lead_time_days)
       VALUES ($1,$2,10) RETURNING id`, [`SUP_${suffix}`, 'Phase 9 supplier']
    )).rows[0];
    const salesBatch = (await client.query(
      `INSERT INTO inventory.batch (sku_id,batch_code,manufacturing_date,expiration_date,first_received_date)
       VALUES ($1,$2,'2026-01-01','2027-12-31','2026-06-01') RETURNING id`,
      [sku.id, `SALES_${suffix}`]
    )).rows[0];
    await client.query(
      `SELECT inventory.post_movement(
        'RECEIPT','PHASE9_SEED',$1,$2,$3,$4,40,
        NULL,NULL,NULL,$5,$6,'AVAILABLE',$7,$8,'Phase 9 planning seed'
      )`, [randomUUID(), randomUUID(), sku.id, salesBatch.id, warehouse.id, location.id, actor.id, correlationId]
    );

    const issueRequest = (await client.query(
      `INSERT INTO outbound.issue_request (
        issue_code,warehouse_id,sales_channel,status,requested_by,idempotency_key,request_hash
      ) VALUES ($1,$2,'WHOLESALE','POSTED',$3,$4,$5) RETURNING id`,
      [`IR_${suffix}`, warehouse.id, actor.id, randomUUID(), 'a'.repeat(64)]
    )).rows[0];
    const issueLine = (await client.query(
      `INSERT INTO outbound.issue_request_line (
        issue_request_id,line_number,sku_id,requested_quantity,allocated_quantity,picked_quantity,posted_quantity
      ) VALUES ($1,1,$2,30,30,30,30) RETURNING id`, [issueRequest.id, sku.id]
    )).rows[0];
    const reservation = (await client.query(
      `INSERT INTO inventory.inventory_reservation (
        demand_type,demand_id,sku_id,warehouse_id,batch_id,location_id,
        quantity_reserved,quantity_fulfilled,status,idempotency_key
      ) VALUES ('ISSUE_REQUEST',$1,$2,$3,$4,$5,30,30,'FULFILLED',$6) RETURNING id`,
      [issueRequest.id, sku.id, warehouse.id, salesBatch.id, location.id, randomUUID()]
    )).rows[0];
    const allocation = (await client.query(
      `INSERT INTO outbound.allocation (
        issue_request_line_id,reservation_id,batch_id,location_id,quantity,picked_quantity,
        fulfilled_quantity,status,fefo_rank,allocated_by
      ) VALUES ($1,$2,$3,$4,30,30,30,'FULFILLED',1,$5) RETURNING id`,
      [issueLine.id, reservation.id, salesBatch.id, location.id, actor.id]
    )).rows[0];
    const goodsIssue = (await client.query(
      `INSERT INTO outbound.goods_issue (
        goods_issue_code,issue_request_id,status,idempotency_key,request_hash,posted_by,posted_at,correlation_id
      ) VALUES ($1,$2,'POSTED',$3,$4,$5,'2026-07-19T08:00:00Z',$6) RETURNING id`,
      [`GI_${suffix}`, issueRequest.id, randomUUID(), 'b'.repeat(64), actor.id, correlationId]
    )).rows[0];
    await client.query(
      `INSERT INTO outbound.goods_issue_line (
        goods_issue_id,allocation_id,reservation_id,sku_id,batch_id,location_id,quantity
      ) VALUES ($1,$2,$3,$4,$5,$6,30)`,
      [goodsIssue.id, allocation.id, reservation.id, sku.id, salesBatch.id, location.id]
    );
    await client.query(
      `SELECT inventory.post_movement(
        'ISSUE','GOODS_ISSUE',$1,$2,$3,$4,30,
        $5,$6,'AVAILABLE',NULL,NULL,NULL,$7,$8,'Phase 9 sales history'
      )`, [goodsIssue.id, randomUUID(), sku.id, salesBatch.id, warehouse.id, location.id, actor.id, correlationId]
    );

    const policy = await planning.createPolicy(actor.id, {
      warehouseId: warehouse.id, skuId: sku.id, supplierId: supplier.id,
      leadTimeDays: 10, safetyStockQuantity: 20, coverageDays: 30,
      salesWindowDays: 30, orderMultiple: 12, validFrom: '2026-01-01'
    }, randomUUID(), correlationId);
    assert.equal(policy.replayed, false);
    const run = await planning.run(actor.id, warehouse.id, businessDate, randomUUID(), correlationId);
    assert.equal(run.results[0].atp, 10);
    assert.equal(run.results[0].averageDailySales, 1);
    assert.equal(run.results[0].reorderPoint, 30);
    assert.equal(run.results[0].suggestedQuantity, 48);
    assert.equal(run.drafts.length, 1);
    assert.equal(run.drafts[0].status, 'DRAFT');
    const replayedRun = await planning.run(actor.id, warehouse.id, businessDate, randomUUID(), correlationId);
    assert.equal(replayedRun.replayed, true);
    assert.equal(replayedRun.drafts.length, 1);
    assert.equal(Number((await client.query(
      `SELECT count(*) FROM planning.draft_purchase_request WHERE warehouse_id=$1 AND sku_id=$2 AND suggestion_date=$3`,
      [warehouse.id, sku.id, businessDate]
    )).rows[0].count), 1);

    async function createReceivedPo({ poCode, skuId, ordered, receipts, unitPrice }) {
      const po = (await client.query(
        `INSERT INTO purchasing.purchase_order (
          po_code,supplier_id,status,order_date,expected_delivery_date,created_by
        ) VALUES ($1,$2,'RECEIVED','2026-07-01','2026-07-15T23:59:59Z',$3) RETURNING id`,
        [poCode, supplier.id, actor.id]
      )).rows[0];
      const poLine = (await client.query(
        `INSERT INTO purchasing.purchase_order_line (
          po_id,sku_id,ordered_qty,received_qty,uom_id,unit_price
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [po.id, skuId, ordered, receipts.reduce((sum, item) => sum + item.quantity, 0), uom.id, unitPrice]
      )).rows[0];
      let receiptNumber = 0;
      for (const spec of receipts) {
        receiptNumber += 1;
        const batch = (await client.query(
          `INSERT INTO inventory.batch (sku_id,batch_code,manufacturing_date,expiration_date,first_received_date)
           VALUES ($1,$2,'2026-01-01','2028-01-01',$3::date) RETURNING id`,
          [skuId, `${poCode}_B${receiptNumber}`, spec.at]
        )).rows[0];
        const receipt = (await client.query(
          `INSERT INTO receiving.goods_receipt (
            gr_code,po_id,status,received_date,received_by,idempotency_key
          ) VALUES ($1,$2,'POSTED',$3,$4,$5) RETURNING id`,
          [`GR_${poCode}_${receiptNumber}`, po.id, spec.at, actor.id, randomUUID()]
        )).rows[0];
        await client.query(
          `INSERT INTO receiving.goods_receipt_line (
            gr_id,po_line_id,sku_id,batch_id,quantity,uom_id,location_id,stock_status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [receipt.id, poLine.id, skuId, batch.id, spec.quantity, uom.id, location.id, spec.status]
        );
        await client.query(
          `SELECT inventory.post_movement(
            'RECEIPT','GOODS_RECEIPT',$1,$2,$3,$4,$5,
            NULL,NULL,NULL,$6,$7,$8,$9,$10,'Phase 9 supplier KPI receipt'
          )`, [receipt.id, randomUUID(), skuId, batch.id, spec.quantity,
            warehouse.id, location.id, spec.status, actor.id, correlationId]
        );
      }
      return po;
    }

    await createReceivedPo({
      poCode: `PO_A_${suffix}`, skuId: sku.id, ordered: 100, unitPrice: 10,
      receipts: [
        { at: '2026-07-14T08:00:00Z', quantity: 60, status: 'AVAILABLE' },
        { at: '2026-07-16T08:00:00Z', quantity: 50, status: 'DAMAGED' }
      ]
    });
    await createReceivedPo({
      poCode: `PO_B_${suffix}`, skuId: secondSku.id, ordered: 50, unitPrice: 20,
      receipts: [{ at: '2026-07-14T09:00:00Z', quantity: 50, status: 'AVAILABLE' }]
    });

    const kpi = await reporting.supplierKpi(
      actor.id, supplier.id, '2026-07-01', '2026-07-31', 'Asia/Ho_Chi_Minh', correlationId
    );
    assert.equal(kpi.kpi.scheduleCount, 2);
    assert.equal(kpi.kpi.otdPercent, 50);
    assert.equal(kpi.kpi.fillRatePercent, 73.33);
    assert.equal(kpi.kpi.overReceiptQuantity, 10);
    assert.ok(kpi.drilldown.every((line) => line.fillRatePercent <= 100));

    const valuation = await reporting.inventoryValue(actor.id, warehouse.id, correlationId);
    assert.ok(valuation.totalValue > 0);
    assert.ok(valuation.items.some((item) => item.unitCost === 10));
    const costReconciliation = await client.query(
      `SELECT count(*)::bigint AS movement_count,
        (SELECT count(*)::bigint FROM reporting.inventory_cost_ledger) AS cost_count
       FROM inventory.inventory_movement_ledger`
    );
    assert.equal(Number(costReconciliation.rows[0].cost_count), Number(costReconciliation.rows[0].movement_count));
    const dashboard = await reporting.dashboard(actor.id, warehouse.id, businessDate, correlationId);
    assert.equal(dashboard.alerts.belowRop, 0);
    assert.equal(dashboard.alerts.draftPurchaseRequests, 1);
    const exported = await reporting.createExport(actor.id, valuation.reportRunId, correlationId);
    assert.equal(exported.status, 'COMPLETED');
    const exportPayload = await reporting.getExport(actor.id, exported.id);
    assert.match(exportPayload.content, /totalValue/);

    const endpoint = await integration.createEndpoint(actor.id, {
      code: `MOCK_${suffix}`, systemType: 'TEST', transport: 'MOCK',
      maxAttempts: 2, baseBackoffSeconds: 1, eventTypes: [`PHASE9_TEST_EVENT_${suffix}`]
    }, randomUUID(), correlationId);
    assert.equal(endpoint.replayed, false);
    const event = (await client.query(
      `INSERT INTO platform.outbox_event (
        aggregate_type,aggregate_id,event_type,payload,correlation_id
      ) VALUES ('PHASE9_TEST',$1,$2,$3::jsonb,$4) RETURNING id`,
      [randomUUID(), `PHASE9_TEST_EVENT_${suffix}`, JSON.stringify({ externalReference: `EXT-${suffix}` }), correlationId]
    )).rows[0];
    const failingPublisher = async () => { throw new DeliveryPublishError('Simulated temporary outage', 503); };
    await processOutboxBatch(workerPool, 10_000, failingPublisher);
    await client.query(`UPDATE integration.outbox_delivery SET available_at=now() WHERE event_id=$1`, [event.id]);
    await client.query(`UPDATE platform.outbox_event SET available_at=now() WHERE id=$1`, [event.id]);
    await processOutboxBatch(workerPool, 10_000, failingPublisher);
    const dead = await integration.listDeadLetters(actor.id);
    assert.ok(dead.some((item) => item.eventId === event.id && item.cycleAttempts === 2));
    const deadDetail = await integration.getEvent(actor.id, event.id);
    assert.equal(deadDetail.status, 'DEAD_LETTER');
    assert.equal(deadDetail.deliveries[0].history.length, 2);
    await integration.replay(actor.id, event.id, 'External endpoint recovered', correlationId);
    await processOutboxBatch(workerPool, 10_000, async () => ({ responseStatus: 200 }));
    const published = await integration.getEvent(actor.id, event.id);
    assert.equal(published.status, 'PUBLISHED');
    assert.equal(published.deliveries.length, 1);
    assert.equal(published.deliveries[0].history.length, 3);
    assert.equal(published.replays.length, 1);
    const reconciliation = await integration.reconciliation(actor.id);
    assert.equal(reconciliation.staleProcessing.events, 0);

    const inventoryReconciliation = await client.query(
      `SELECT count(*)::bigint AS variance_count FROM inventory.ledger_balance_reconciliation
       WHERE warehouse_id=$1 AND variance<>0`, [warehouse.id]
    );
    assert.equal(Number(inventoryReconciliation.rows[0].variance_count), 0);
  } finally {
    await client.end();
    await workerPool.end();
    await Promise.all([planningDb.onModuleDestroy(), reportingDb.onModuleDestroy(), integrationDb.onModuleDestroy()]);
  }
});
