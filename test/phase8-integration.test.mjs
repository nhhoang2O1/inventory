import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { QualityDatabaseService } from '../apps/api/dist/modules/quality/public/quality-database.service.js';
import { QualityService } from '../apps/api/dist/modules/quality/public/quality.service.js';
import { CustomerReturnService } from '../apps/api/dist/modules/quality/public/customer-return.service.js';
import { RecallDatabaseService } from '../apps/api/dist/modules/recall/public/recall-database.service.js';
import { RecallService } from '../apps/api/dist/modules/recall/public/recall.service.js';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

test('Integration: Phase 8 hold, return, expiry and recall containment/disposition', async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const qualityDb = new QualityDatabaseService();
  const recallDb = new RecallDatabaseService();
  const quality = new QualityService(qualityDb);
  const customerReturn = new CustomerReturnService(qualityDb);
  const recall = new RecallService(recallDb);
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
  const correlationId = randomUUID();

  try {
    const role = (await client.query(
      `INSERT INTO iam.role (code, name, is_system) VALUES ($1,$2,true) RETURNING id`,
      [`PHASE8_${suffix}`, 'Phase 8 integration role']
    )).rows[0];
    const actors = [];
    for (const name of ['reporter', 'approver', 'containment', 'poster']) {
      actors.push((await client.query(
        `INSERT INTO iam.app_user (username, display_name, role_id, password_hash)
         VALUES ($1,$2,$3,'test_hash') RETURNING id`,
        [`p8_${name}_${suffix.toLowerCase()}`, `Phase 8 ${name}`, role.id]
      )).rows[0]);
    }
    const [reporter, approver, containmentActor, poster] = actors;
    await client.query(
      `INSERT INTO iam.role_permission (role_id, permission_id, granted_by)
       SELECT $1, id, $2 FROM iam.permission
       WHERE code LIKE 'QUALITY.%' OR code LIKE 'RETURN.%' OR code LIKE 'RECALL.%'`,
      [role.id, approver.id]
    );

    const warehouse = (await client.query(
      `INSERT INTO warehouse.warehouse (code, name) VALUES ($1,$2) RETURNING id`,
      [`WH_${suffix}`, 'Phase 8 warehouse']
    )).rows[0];
    for (const actor of actors) {
      await client.query(
        `INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
         VALUES ($1,$2,now())`, [actor.id, warehouse.id]
      );
    }
    const locations = {};
    for (const spec of [
      { key: 'storage', zoneType: 'STORAGE' },
      { key: 'quarantine', zoneType: 'QUARANTINE' },
      { key: 'expired', zoneType: 'QUARANTINE' },
      { key: 'damaged', zoneType: 'DAMAGED' }
    ]) {
      const zone = (await client.query(
        `INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [warehouse.id, `Z_${spec.key.toUpperCase()}_${suffix}`, `${spec.key} zone`, spec.zoneType]
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
      `INSERT INTO catalog.category (code, name) VALUES ($1,$2) RETURNING id`, [`CAT_${suffix}`, 'Phase 8 category']
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO catalog.product (code, name, category_id) VALUES ($1,$2,$3) RETURNING id`,
      [`PROD_${suffix}`, 'Phase 8 product', category.id]
    )).rows[0];
    const sku = (await client.query(
      `INSERT INTO catalog.sku (product_id, code, name, base_uom_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [product.id, `SKU_${suffix}`, 'Phase 8 SKU', uom.id]
    )).rows[0];
    const validBatch = (await client.query(
      `INSERT INTO inventory.batch (sku_id, batch_code, manufacturing_date, expiration_date, first_received_date)
       VALUES ($1,$2,'2026-01-01','2028-01-01','2026-01-02') RETURNING id`,
      [sku.id, `VALID_${suffix}`]
    )).rows[0];
    const expiredBatch = (await client.query(
      `INSERT INTO inventory.batch (sku_id, batch_code, manufacturing_date, expiration_date, first_received_date)
       VALUES ($1,$2,'2024-01-01','2025-01-01','2024-01-02') RETURNING id`,
      [sku.id, `EXPIRED_${suffix}`]
    )).rows[0];
    for (const seed of [{ batchId: validBatch.id, quantity: 30 }, { batchId: expiredBatch.id, quantity: 4 }]) {
      await client.query(
        `SELECT inventory.post_movement(
           'RECEIPT','PHASE8_TEST_SEED',$1,$2,$3,$4,$5,
           NULL,NULL,NULL,$6,$7,'AVAILABLE',$8,$9,'Phase 8 integration seed'
         )`,
        [randomUUID(), randomUUID(), sku.id, seed.batchId, seed.quantity,
          warehouse.id, locations.storage.id, reporter.id, correlationId]
      );
    }

    const validBalance = (await client.query(
      `SELECT id FROM inventory.inventory_balance
       WHERE sku_id = $1 AND batch_id = $2 AND warehouse_id = $3
         AND location_id = $4 AND stock_status = 'AVAILABLE'`,
      [sku.id, validBatch.id, warehouse.id, locations.storage.id]
    )).rows[0];
    const qualityDraft = await quality.createCase(reporter.id, {
      caseCode: `QC_HOLD_${suffix}`,
      caseType: 'DAMAGE',
      warehouseId: warehouse.id,
      reason: 'Packaging inspection required',
      lines: [{ balanceId: validBalance.id, holdLocationId: locations.quarantine.id, quantity: 5 }]
    }, randomUUID(), correlationId);
    const contained = await quality.containCase(
      containmentActor.id, qualityDraft.id, qualityDraft.version, randomUUID(), correlationId
    );
    assert.equal(contained.status, 'CONTAINED');
    const heldCase = await quality.findCase(reporter.id, qualityDraft.id);
    const releaseRequest = await quality.requestDisposition(reporter.id, qualityDraft.id, {
      dispositionCode: `DSP_RELEASE_${suffix}`,
      dispositionType: 'RELEASE',
      reason: 'Inspection passed',
      destinations: [{ qualityCaseLineId: heldCase.lines[0].id, destinationLocationId: locations.storage.id }]
    }, contained.version, randomUUID(), correlationId);
    const releaseApproval = await quality.approveDisposition(
      approver.id, releaseRequest.id, releaseRequest.version, correlationId
    );
    const released = await quality.postDisposition(
      poster.id, releaseRequest.id, releaseApproval.version, randomUUID(), correlationId
    );
    assert.equal(released.status, 'POSTED');
    assert.equal(Number((await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE batch_id = $1 AND location_id = $2 AND stock_status = 'AVAILABLE'`,
      [validBatch.id, locations.storage.id]
    )).rows[0].quantity_on_hand), 30);

    const returnDraft = await customerReturn.create(reporter.id, {
      returnCode: `RET_${suffix}`,
      warehouseId: warehouse.id,
      customerReference: `CUSTOMER-${suffix}`,
      reason: 'Customer reported damaged outer carton',
      lines: [{ skuId: sku.id, batchId: validBatch.id, quarantineLocationId: locations.quarantine.id, quantity: 3 }]
    }, randomUUID(), correlationId);
    const returnApproval = await customerReturn.approve(approver.id, returnDraft.id, returnDraft.version, correlationId);
    const returned = await customerReturn.post(
      containmentActor.id, returnDraft.id, returnApproval.version, randomUUID(), correlationId
    );
    assert.equal(returned.status, 'POSTED');
    const returnCase = await quality.findCase(reporter.id, returned.qualityCaseId);
    const returnDisposition = await quality.requestDisposition(reporter.id, returned.qualityCaseId, {
      dispositionCode: `DSP_RETURN_${suffix}`,
      dispositionType: 'RECLASSIFY_DAMAGED',
      reason: 'Confirmed damaged customer return',
      destinations: [{ qualityCaseLineId: returnCase.lines[0].id, destinationLocationId: locations.damaged.id }]
    }, returnCase.version, randomUUID(), correlationId);
    const returnDispositionApproval = await quality.approveDisposition(
      approver.id, returnDisposition.id, returnDisposition.version, correlationId
    );
    await quality.postDisposition(
      poster.id, returnDisposition.id, returnDispositionApproval.version, randomUUID(), correlationId
    );
    assert.equal((await customerReturn.findOne(reporter.id, returnDraft.id)).status, 'CLOSED');
    assert.equal(Number((await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE batch_id = $1 AND location_id = $2 AND stock_status = 'DAMAGED'`,
      [validBatch.id, locations.damaged.id]
    )).rows[0].quantity_on_hand), 3);

    const expiry = await quality.runExpiry(
      containmentActor.id, warehouse.id, locations.expired.id, '2026-07-20', randomUUID(), correlationId
    );
    assert.equal(expiry.expiredLineCount, 1);
    assert.equal(Number((await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE batch_id = $1 AND location_id = $2 AND stock_status = 'EXPIRED'`,
      [expiredBatch.id, locations.expired.id]
    )).rows[0].quantity_on_hand), 4);
    const expiryCase = await quality.findCase(reporter.id, expiry.qualityCaseId);
    const expiryDisposition = await quality.requestDisposition(reporter.id, expiry.qualityCaseId, {
      dispositionCode: `DSP_EXPIRY_${suffix}`,
      dispositionType: 'DESTROY',
      reason: 'Expired stock destruction approved'
    }, expiryCase.version, randomUUID(), correlationId);
    const expiryApproval = await quality.approveDisposition(
      approver.id, expiryDisposition.id, expiryDisposition.version, correlationId
    );
    await quality.postDisposition(poster.id, expiryDisposition.id, expiryApproval.version, randomUUID(), correlationId);

    await client.query(
      `SELECT inventory.post_movement(
         'ISSUE','GOODS_ISSUE',$1,$2,$3,$4,2,
         $5,$6,'AVAILABLE',NULL,NULL,NULL,$7,$8,'Traceable pre-recall issue'
       )`,
      [randomUUID(), randomUUID(), sku.id, validBatch.id, warehouse.id, locations.storage.id, reporter.id, correlationId]
    );
    const recallDraft = await recall.create(reporter.id, {
      recallCode: `RCL_${suffix}`,
      skuId: sku.id,
      batchId: validBatch.id,
      severity: 'CLASS_II',
      reason: 'Supplier batch recall notice',
      scopes: [{ warehouseId: warehouse.id, recallLocationId: locations.quarantine.id }]
    }, randomUUID(), correlationId);
    const recallApproval = await recall.approve(approver.id, recallDraft.id, recallDraft.version, correlationId);
    await assert.rejects(
      client.query(
        `SELECT inventory.post_movement(
           'RECEIPT','RECALL_GUARD_TEST',$1,$2,$3,$4,1,
           NULL,NULL,NULL,$5,$6,'AVAILABLE',$7,$8,'Must be blocked by active recall'
         )`,
        [randomUUID(), randomUUID(), sku.id, validBatch.id, warehouse.id, locations.storage.id, reporter.id, correlationId]
      ),
      /RECALL_ACTIVE_BATCH_BLOCKED/
    );
    const recallContained = await recall.contain(
      containmentActor.id, recallDraft.id, recallApproval.version, randomUUID(), correlationId
    );
    assert.equal(recallContained.status, 'CONTAINED');
    assert.equal(recallContained.qualityCaseIds.length, 1);
    const recalledQuantity = await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE batch_id = $1 AND location_id = $2 AND stock_status = 'RECALLED'`,
      [validBatch.id, locations.quarantine.id]
    );
    assert.equal(Number(recalledQuantity.rows[0].quantity_on_hand), 31);
    const recallView = await recall.findOne(reporter.id, recallDraft.id);
    assert.ok(recallView.traceability.some((movement) => movement.document_type === 'GOODS_ISSUE'));
    assert.ok(recallView.traceability.some((movement) => movement.document_type === 'RECALL_CONTAINMENT'));

    const recallQualityCase = await quality.findCase(reporter.id, recallContained.qualityCaseIds[0]);
    const recallDisposition = await quality.requestDisposition(reporter.id, recallQualityCase.id, {
      dispositionCode: `DSP_RECALL_${suffix}`,
      dispositionType: 'DESTROY',
      reason: 'Recalled batch destruction approved'
    }, recallQualityCase.version, randomUUID(), correlationId);
    const recallDispositionApproval = await quality.approveDisposition(
      approver.id, recallDisposition.id, recallDisposition.version, correlationId
    );
    await quality.postDisposition(
      poster.id, recallDisposition.id, recallDispositionApproval.version, randomUUID(), correlationId
    );
    assert.equal((await recall.findOne(reporter.id, recallDraft.id)).status, 'CLOSED');
    assert.equal(Number((await client.query(
      `SELECT coalesce(sum(quantity_on_hand),0)::bigint AS quantity FROM inventory.inventory_balance
       WHERE batch_id = $1 AND stock_status = 'RECALLED'`, [validBatch.id]
    )).rows[0].quantity), 0);

    const reconciliation = await client.query(
      `SELECT count(*)::bigint AS variance_count FROM inventory.ledger_balance_reconciliation
       WHERE sku_id = $1 AND variance <> 0`, [sku.id]
    );
    assert.equal(Number(reconciliation.rows[0].variance_count), 0);
    const evidence = await client.query(
      `SELECT
         (SELECT count(*) FROM audit.audit_event WHERE correlation_id = $1 AND resource_type IN ('QUALITY_CASE','QUALITY_DISPOSITION','CUSTOMER_RETURN','EXPIRY_RUN','RECALL_CASE')) AS audit_count,
         (SELECT count(*) FROM platform.outbox_event WHERE correlation_id = $1 AND aggregate_type IN ('QUALITY_CASE','QUALITY_DISPOSITION','CUSTOMER_RETURN','EXPIRY_RUN','RECALL_CASE')) AS outbox_count`,
      [correlationId]
    );
    assert.ok(Number(evidence.rows[0].audit_count) >= 15);
    assert.ok(Number(evidence.rows[0].outbox_count) >= 9);
  } finally {
    await client.end();
    await Promise.all([qualityDb.onModuleDestroy(), recallDb.onModuleDestroy()]);
  }
});
