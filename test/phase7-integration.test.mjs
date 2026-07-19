import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { TransferDatabaseService } from '../apps/api/dist/modules/transfer/public/transfer-database.service.js';
import { TransferService } from '../apps/api/dist/modules/transfer/public/transfer.service.js';
import { StocktakeDatabaseService } from '../apps/api/dist/modules/stocktake/public/stocktake-database.service.js';
import { StocktakeService } from '../apps/api/dist/modules/stocktake/public/stocktake.service.js';
import { AdjustmentDatabaseService } from '../apps/api/dist/modules/adjustment/public/adjustment-database.service.js';
import { ReversalService } from '../apps/api/dist/modules/adjustment/public/reversal.service.js';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

test('Integration: Phase 7 warehouse transfer, blind recount, adjustment and append-only reversal', async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const transferDb = new TransferDatabaseService();
  const stocktakeDb = new StocktakeDatabaseService();
  const adjustmentDb = new AdjustmentDatabaseService();
  const transfer = new TransferService(transferDb);
  const stocktake = new StocktakeService(stocktakeDb);
  const reversal = new ReversalService(adjustmentDb);
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
  const correlationId = randomUUID();

  try {
    const role = (await client.query(
      `INSERT INTO iam.role (code, name, is_system) VALUES ($1,$2,true) RETURNING id`,
      [`PHASE7_${suffix}`, 'Phase 7 integration role']
    )).rows[0];
    const actors = [];
    for (const name of ['creator_counter', 'approver', 'receiver', 'poster']) {
      actors.push((await client.query(
        `INSERT INTO iam.app_user (username, display_name, role_id, password_hash)
         VALUES ($1,$2,$3,'test_hash') RETURNING id`,
        [`p7_${name}_${suffix.toLowerCase()}`, `Phase 7 ${name}`, role.id]
      )).rows[0]);
    }
    const [creator, approver, receiver, poster] = actors;
    await client.query(
      `INSERT INTO iam.role_permission (role_id, permission_id, granted_by)
       SELECT $1, id, $2 FROM iam.permission
       WHERE code LIKE 'TRANSFER.%' OR code LIKE 'STOCKTAKE.%' OR code IN ('ADJUSTMENT.POST','ADJUSTMENT.REVERSE')`,
      [role.id, approver.id]
    );

    const warehouses = {};
    for (const spec of [
      { key: 'source', type: 'PHYSICAL' },
      { key: 'destination', type: 'PHYSICAL' },
      { key: 'transit', type: 'TRANSIT' }
    ]) {
      warehouses[spec.key] = (await client.query(
        `INSERT INTO warehouse.warehouse (code, name, warehouse_type)
         VALUES ($1,$2,$3) RETURNING id`,
        [`WH_${spec.key.toUpperCase()}_${suffix}`, `Phase 7 ${spec.key}`, spec.type]
      )).rows[0];
    }
    for (const actor of actors) {
      for (const warehouse of Object.values(warehouses)) {
        await client.query(
          `INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
           VALUES ($1,$2,now())`, [actor.id, warehouse.id]
        );
      }
    }

    const locations = {};
    for (const spec of [
      { key: 'source', warehouse: 'source', zoneType: 'PICKING' },
      { key: 'destination', warehouse: 'destination', zoneType: 'STORAGE' },
      { key: 'damaged', warehouse: 'destination', zoneType: 'DAMAGED' },
      { key: 'transit', warehouse: 'transit', zoneType: 'TRANSIT' }
    ]) {
      const zone = (await client.query(
        `INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [warehouses[spec.warehouse].id, `Z_${spec.key.toUpperCase()}_${suffix}`, `${spec.key} zone`, spec.zoneType]
      )).rows[0];
      locations[spec.key] = (await client.query(
        `INSERT INTO warehouse.location (zone_id, code, barcode, mixing_policy)
         VALUES ($1,$2,$3,'SINGLE_SKU') RETURNING id`,
        [zone.id, `L_${spec.key.toUpperCase()}_${suffix}`, `BC-${spec.key}-${suffix}`]
      )).rows[0];
    }

    const uom = (await client.query(
      `INSERT INTO catalog.unit_of_measure (code, name)
       VALUES ('CASE','Case') ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    )).rows[0];
    const category = (await client.query(
      `INSERT INTO catalog.category (code, name) VALUES ($1,$2) RETURNING id`,
      [`CAT_${suffix}`, 'Phase 7 category']
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO catalog.product (code, name, category_id) VALUES ($1,$2,$3) RETURNING id`,
      [`PROD_${suffix}`, 'Phase 7 product', category.id]
    )).rows[0];
    const sku = (await client.query(
      `INSERT INTO catalog.sku (product_id, code, name, base_uom_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [product.id, `SKU_${suffix}`, 'Phase 7 SKU', uom.id]
    )).rows[0];
    const batch = (await client.query(
      `INSERT INTO inventory.batch (
         sku_id, batch_code, manufacturing_date, expiration_date, first_received_date
       ) VALUES ($1,$2,'2026-01-01','2028-01-01','2026-01-02') RETURNING id`,
      [sku.id, `BATCH_${suffix}`]
    )).rows[0];
    await client.query(
      `SELECT inventory.post_movement(
         'RECEIPT','PHASE7_TEST_SEED',$1,$2,$3,$4,20,
         NULL,NULL,NULL,$5,$6,'AVAILABLE',$7,$8,'Phase 7 integration seed'
       )`,
      [randomUUID(), randomUUID(), sku.id, batch.id, warehouses.source.id, locations.source.id, creator.id, correlationId]
    );

    const created = await transfer.createTransfer(creator.id, {
      transferCode: `TR_${suffix}`,
      transferType: 'WAREHOUSE',
      sourceWarehouseId: warehouses.source.id,
      destinationWarehouseId: warehouses.destination.id,
      transitWarehouseId: warehouses.transit.id,
      transitLocationId: locations.transit.id,
      lines: [{
        skuId: sku.id,
        batchId: batch.id,
        sourceLocationId: locations.source.id,
        destinationLocationId: locations.destination.id,
        quantity: 20
      }]
    }, randomUUID(), correlationId);
    const approved = await transfer.approveTransfer(approver.id, created.id, created.version, correlationId);
    const picking = await transfer.startPicking(creator.id, created.id, approved.version, correlationId);
    const detail = await transfer.findTransfer(creator.id, created.id);
    const pickKey = randomUUID();
    const picked = await transfer.confirmPick(
      creator.id, created.id, detail.lines[0].id, 20, picking.version, pickKey, correlationId
    );
    const pickReplay = await transfer.confirmPick(
      creator.id, created.id, detail.lines[0].id, 20, picking.version, pickKey, correlationId
    );
    assert.equal(pickReplay.replayed, true);
    assert.equal(pickReplay.version, picked.version);
    const dispatched = await transfer.dispatchTransfer(
      creator.id, created.id, picked.version, randomUUID(), correlationId, 'Warehouse dispatch'
    );
    assert.equal(dispatched.status, 'IN_TRANSIT');
    const transitBalance = await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE sku_id = $1 AND warehouse_id = $2 AND stock_status = 'IN_TRANSIT'`,
      [sku.id, warehouses.transit.id]
    );
    assert.equal(Number(transitBalance.rows[0].quantity_on_hand), 20);
    const transitAtp = await client.query(
      `SELECT coalesce((SELECT atp FROM inventory.atp_by_sku_warehouse
                        WHERE sku_id = $1 AND warehouse_id = $2),0)::bigint AS atp`,
      [sku.id, warehouses.transit.id]
    );
    assert.equal(Number(transitAtp.rows[0].atp), 0);

    const receipt = await transfer.receiveTransfer(receiver.id, created.id, `RCV_${suffix}`, [{
      transferLineId: detail.lines[0].id,
      destinationLocationId: locations.destination.id,
      damagedLocationId: locations.damaged.id,
      receivedQuantity: 18,
      damagedQuantity: 1,
      missingQuantity: 1,
      reason: 'One damaged case and one missing case'
    }], dispatched.version, randomUUID(), correlationId);
    assert.equal(receipt.status, 'PARTIALLY_RECEIVED');
    const afterReceipt = await transfer.findTransfer(receiver.id, created.id);
    const damagedDiscrepancy = afterReceipt.discrepancies.find((item) => item.discrepancy_type === 'DAMAGED');
    const lossDiscrepancy = afterReceipt.discrepancies.find((item) => item.discrepancy_type === 'LOSS');
    await transfer.resolveDiscrepancy(approver.id, damagedDiscrepancy.id, 'ACCEPT_DAMAGED', randomUUID(), correlationId);
    await transfer.resolveDiscrepancy(approver.id, lossDiscrepancy.id, 'WRITE_OFF', randomUUID(), correlationId);
    const beforeClose = await transfer.findTransfer(creator.id, created.id);
    assert.equal(beforeClose.status, 'RECEIVED');
    const closed = await transfer.closeTransfer(creator.id, created.id, beforeClose.version, correlationId);
    assert.equal(closed.status, 'CLOSED');

    const physicalBalances = await client.query(
      `SELECT warehouse_id, location_id, stock_status, quantity_on_hand
       FROM inventory.inventory_balance WHERE sku_id = $1 AND batch_id = $2`, [sku.id, batch.id]
    );
    const balanceAt = (warehouseId, locationId, status) => Number(
      physicalBalances.rows.find((row) => row.warehouse_id === warehouseId && row.location_id === locationId && row.stock_status === status)?.quantity_on_hand ?? 0
    );
    assert.equal(balanceAt(warehouses.source.id, locations.source.id, 'AVAILABLE'), 0);
    assert.equal(balanceAt(warehouses.transit.id, locations.transit.id, 'IN_TRANSIT'), 0);
    assert.equal(balanceAt(warehouses.destination.id, locations.destination.id, 'AVAILABLE'), 18);
    assert.equal(balanceAt(warehouses.destination.id, locations.damaged.id, 'DAMAGED'), 1);

    const planned = await stocktake.createSession(creator.id, {
      sessionCode: `ST_${suffix}`,
      warehouseId: warehouses.destination.id,
      locationId: locations.destination.id,
      blindCount: true,
      recountThreshold: 0
    }, randomUUID(), correlationId);
    const started = await stocktake.startSession(creator.id, planned.id, planned.version, correlationId);
    assert.equal(started.status, 'COUNTING');
    const blindView = await stocktake.findSession(creator.id, planned.id);
    assert.equal(blindView.snapshots[0].system_quantity, undefined);
    assert.equal((await client.query('SELECT status FROM warehouse.location WHERE id = $1', [locations.destination.id])).rows[0].status, 'STOCKTAKE');
    await assert.rejects(
      client.query(
        `SELECT inventory.post_movement(
           'RECEIPT','PHASE7_LOCK_TEST',$1,$2,$3,$4,1,
           NULL,NULL,NULL,$5,$6,'AVAILABLE',$7,$8,'Must be rejected while counting'
         )`,
        [randomUUID(), randomUUID(), sku.id, batch.id, warehouses.destination.id, locations.destination.id, creator.id, correlationId]
      ),
      /INVENTORY_LOCATION_STOCKTAKE_LOCKED/
    );

    await stocktake.recordCount(
      creator.id, planned.id, blindView.snapshots[0].id, 17, 'count-sheet-round-1',
      started.version, randomUUID(), correlationId
    );
    const recount = await stocktake.completeRound(creator.id, planned.id, started.version, correlationId);
    assert.equal(recount.status, 'RECOUNT');
    await stocktake.recordCount(
      creator.id, planned.id, blindView.snapshots[0].id, 17, 'count-sheet-round-2',
      recount.version, randomUUID(), correlationId
    );
    const reconciled = await stocktake.completeRound(creator.id, planned.id, recount.version, correlationId);
    assert.equal(reconciled.status, 'RECONCILED');
    const pending = await stocktake.requestApproval(creator.id, planned.id, reconciled.version, correlationId);
    const adjustmentApproval = await stocktake.approveSession(
      approver.id, planned.id, pending.version, 'Verified recount variance', correlationId
    );
    const adjustmentPost = await stocktake.postAdjustment(
      poster.id, planned.id, adjustmentApproval.version, randomUUID(), correlationId
    );
    assert.equal(adjustmentPost.status, 'POSTED');
    assert.equal(adjustmentPost.movementIds.length, 1);
    const afterAdjustment = await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE sku_id = $1 AND batch_id = $2 AND location_id = $3 AND stock_status = 'AVAILABLE'`,
      [sku.id, batch.id, locations.destination.id]
    );
    assert.equal(Number(afterAdjustment.rows[0].quantity_on_hand), 17);
    assert.equal((await client.query('SELECT status FROM warehouse.location WHERE id = $1', [locations.destination.id])).rows[0].status, 'ACTIVE');

    const reversalDraft = await reversal.createRequest(creator.id, {
      reversalCode: `REV_${suffix}`,
      originalDocumentType: 'INVENTORY_ADJUSTMENT',
      originalDocumentId: adjustmentApproval.adjustmentId,
      movementIds: adjustmentPost.movementIds,
      reason: 'UAT-08 approved stocktake correction reversal'
    }, randomUUID(), correlationId);
    const reversalSubmitted = await reversal.submitRequest(creator.id, reversalDraft.id, reversalDraft.version, correlationId);
    const reversalApproved = await reversal.approveRequest(approver.id, reversalDraft.id, reversalSubmitted.version, correlationId);
    const reversalPosted = await reversal.postRequest(
      receiver.id, reversalDraft.id, reversalApproved.version, randomUUID(), correlationId
    );
    assert.equal(reversalPosted.status, 'POSTED');
    assert.equal(reversalPosted.movementIds.length, 1);
    const afterReversal = await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE sku_id = $1 AND batch_id = $2 AND location_id = $3 AND stock_status = 'AVAILABLE'`,
      [sku.id, batch.id, locations.destination.id]
    );
    assert.equal(Number(afterReversal.rows[0].quantity_on_hand), 18);
    const reversalEvidence = await client.query(
      `SELECT reversal.reversal_of, original.document_type AS original_type, adjustment.status AS adjustment_status
       FROM inventory.inventory_movement_ledger reversal
       JOIN inventory.inventory_movement_ledger original ON original.id = reversal.reversal_of
       JOIN adjustment.inventory_adjustment adjustment ON adjustment.id = original.document_id
       WHERE reversal.id = $1`, [reversalPosted.movementIds[0]]
    );
    assert.equal(reversalEvidence.rows[0].reversal_of, adjustmentPost.movementIds[0]);
    assert.equal(reversalEvidence.rows[0].original_type, 'INVENTORY_ADJUSTMENT');
    assert.equal(reversalEvidence.rows[0].adjustment_status, 'REVERSED');

    const reconciliation = await client.query(
      `SELECT count(*)::bigint AS variance_count
       FROM inventory.ledger_balance_reconciliation WHERE sku_id = $1 AND variance <> 0`, [sku.id]
    );
    assert.equal(Number(reconciliation.rows[0].variance_count), 0);
    const evidence = await client.query(
      `SELECT
         (SELECT count(*) FROM audit.audit_event WHERE resource_type IN ('STOCK_TRANSFER','STOCKTAKE_SESSION','INVENTORY_ADJUSTMENT','REVERSAL_REQUEST') AND correlation_id = $1) AS audit_count,
         (SELECT count(*) FROM platform.outbox_event WHERE correlation_id = $1 AND aggregate_type IN ('STOCK_TRANSFER','STOCKTAKE_SESSION','INVENTORY_ADJUSTMENT','REVERSAL_REQUEST')) AS outbox_count`,
      [correlationId]
    );
    assert.ok(Number(evidence.rows[0].audit_count) >= 10);
    assert.ok(Number(evidence.rows[0].outbox_count) >= 7);
  } finally {
    await client.end();
    await Promise.all([
      transferDb.onModuleDestroy(),
      stocktakeDb.onModuleDestroy(),
      adjustmentDb.onModuleDestroy()
    ]);
  }
});
