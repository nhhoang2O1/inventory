import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { ForbiddenException } from '@nestjs/common';
import { OutboundDatabaseService } from '../apps/api/dist/modules/outbound/public/outbound-database.service.js';
import { OutboundService } from '../apps/api/dist/modules/outbound/public/outbound.service.js';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

test('Integration: Phase 6 FEFO, override, posting and ATP concurrency', async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const outboundDb = new OutboundDatabaseService();
  const service = new OutboundService(outboundDb);
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
  const correlationId = randomUUID();

  try {
    const role = (await client.query(
      `INSERT INTO iam.role (code, name, is_system)
       VALUES ($1,$2,true) RETURNING id`,
      [`OUTBOUND_TEST_${suffix}`, 'Outbound integration role']
    )).rows[0];
    const creator = (await client.query(
      `INSERT INTO iam.app_user (username, display_name, role_id, password_hash)
       VALUES ($1,$2,$3,'test_hash') RETURNING id`,
      [`outbound_creator_${suffix.toLowerCase()}`, 'Outbound Creator', role.id]
    )).rows[0];
    const approver = (await client.query(
      `INSERT INTO iam.app_user (username, display_name, role_id, password_hash)
       VALUES ($1,$2,$3,'test_hash') RETURNING id`,
      [`outbound_approver_${suffix.toLowerCase()}`, 'Outbound Approver', role.id]
    )).rows[0];
    await client.query(
      `INSERT INTO iam.role_permission (role_id, permission_id, granted_by)
       SELECT $1, id, $2 FROM iam.permission
       WHERE code IN (
         'OUTBOUND.VIEW','OUTBOUND.CREATE','OUTBOUND.APPROVE','OUTBOUND.ALLOCATE',
         'OUTBOUND.PICK','OUTBOUND.POST','OUTBOUND.CANCEL'
       )`, [role.id, approver.id]
    );

    const warehouse = (await client.query(
      `INSERT INTO warehouse.warehouse (code, name) VALUES ($1,$2) RETURNING id`,
      [`WH_${suffix}`, 'Outbound test warehouse']
    )).rows[0];
    await client.query(
      `INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
       VALUES ($1,$3,now()),($2,$3,now())`, [creator.id, approver.id, warehouse.id]
    );
    const zone = (await client.query(
      `INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type)
       VALUES ($1,$2,$3,'PICKING') RETURNING id`,
      [warehouse.id, `ZONE_${suffix}`, 'Picking zone']
    )).rows[0];
    const locations = [];
    for (const index of [1, 2, 3]) {
      locations.push((await client.query(
        `INSERT INTO warehouse.location (zone_id, code, barcode, mixing_policy)
         VALUES ($1,$2,$3,'SINGLE_SKU') RETURNING id`,
        [zone.id, `LOC_${suffix}_${index}`, `LOC-BC-${suffix}-${index}`]
      )).rows[0]);
    }

    const uom = (await client.query(
      `INSERT INTO catalog.unit_of_measure (code, name)
       VALUES ('CASE','Case') ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    )).rows[0];
    const category = (await client.query(
      `INSERT INTO catalog.category (code, name) VALUES ($1,$2) RETURNING id`,
      [`CAT_${suffix}`, 'Outbound test category']
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO catalog.product (code, name, category_id) VALUES ($1,$2,$3) RETURNING id`,
      [`PROD_${suffix}`, 'Outbound test product', category.id]
    )).rows[0];
    const sku = (await client.query(
      `INSERT INTO catalog.sku (product_id, code, name, base_uom_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [product.id, `SKU_${suffix}`, 'Outbound test SKU', uom.id]
    )).rows[0];
    const barcode = `893${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await client.query(
      `INSERT INTO catalog.barcode (sku_id, value, valid_from)
       VALUES ($1,$2,now() - interval '1 day')`, [sku.id, barcode]
    );
    await client.query(
      `INSERT INTO catalog.wholesale_quantity_policy (
         sku_id, direction, sales_channel, minimum_quantity, valid_from
       ) VALUES ($1,'OUTBOUND','WHOLESALE',10,now() - interval '1 day')`, [sku.id]
    );
    await client.query(
      `INSERT INTO outbound.mrsl_policy (
         sku_id, sales_channel, warehouse_id, minimum_remaining_days, valid_from
       ) VALUES ($1,'WHOLESALE',$2,30,now() - interval '1 day')`, [sku.id, warehouse.id]
    );

    const batchSpecs = [
      { code: `EARLY_${suffix}`, expiration: '2027-01-01', firstReceived: '2026-01-01' },
      { code: `MIDDLE_${suffix}`, expiration: '2027-02-01', firstReceived: '2026-01-02' },
      { code: `LATE_${suffix}`, expiration: '2027-03-01', firstReceived: '2026-01-03' }
    ];
    const batches = [];
    for (const [index, spec] of batchSpecs.entries()) {
      const batch = (await client.query(
        `INSERT INTO inventory.batch (
           sku_id, batch_code, manufacturing_date, expiration_date, first_received_date
         ) VALUES ($1,$2,'2025-12-01',$3,$4) RETURNING id`,
        [sku.id, spec.code, spec.expiration, spec.firstReceived]
      )).rows[0];
      batches.push(batch);
      await client.query(
        `SELECT inventory.post_movement(
           'RECEIPT','OUTBOUND_TEST_SEED',$1,$2,$3,$4,50,
           NULL,NULL,NULL,$5,$6,'AVAILABLE',$7,$8,'Phase 6 integration seed'
         )`,
        [randomUUID(), `seed:${index}`, sku.id, batch.id, warehouse.id, locations[index].id, creator.id, correlationId]
      );
    }

    const createResult = await service.createIssueRequest(creator.id, {
      issueCode: `IR_FEFO_${suffix}`,
      warehouseId: warehouse.id,
      salesChannel: 'WHOLESALE',
      allowPartial: true,
      lines: [{ skuId: sku.id, quantity: 60 }]
    }, randomUUID(), correlationId);
    const submitted = await service.submitIssueRequest(creator.id, createResult.id, createResult.version, correlationId);
    const approved = await service.approveIssueRequest(approver.id, createResult.id, submitted.version, correlationId);
    const allocated = await service.allocateIssueRequest(
      creator.id,
      createResult.id,
      { expectedVersion: approved.version },
      randomUUID(),
      correlationId
    );
    assert.deepEqual(
      allocated.allocations.map((allocation) => [allocation.batch_id, Number(allocation.quantity)]),
      [[batches[0].id, 50], [batches[1].id, 10]]
    );

    const task = await service.createPickTask(
      creator.id,
      createResult.id,
      allocated.version,
      creator.id,
      correlationId
    );
    let taskVersion = task.version;
    for (const [index, allocation] of allocated.allocations.entries()) {
      const scanKey = randomUUID();
      const expectedTaskVersion = taskVersion;
      const confirmed = await service.confirmPick(
        creator.id,
        task.id,
        allocation.id,
        barcode,
        Number(allocation.quantity),
        expectedTaskVersion,
        scanKey,
        correlationId
      );
      if (index === 0) {
        const scanReplay = await service.confirmPick(
          creator.id,
          task.id,
          allocation.id,
          barcode,
          Number(allocation.quantity),
          expectedTaskVersion,
          scanKey,
          correlationId
        );
        assert.equal(scanReplay.replayed, true);
        assert.equal(scanReplay.version, confirmed.version);
        assert.equal(scanReplay.pickedQuantity, confirmed.pickedQuantity);
      }
      taskVersion = confirmed.version;
    }
    const posted = await service.postGoodsIssue(
      creator.id,
      createResult.id,
      task.issueRequestVersion,
      randomUUID(),
      correlationId
    );
    assert.equal(posted.status, 'POSTED');
    assert.equal(posted.movementIds.length, 2);
    const balancesAfterPost = await client.query(
      `SELECT batch_id, quantity_on_hand FROM inventory.inventory_balance
       WHERE sku_id = $1 AND warehouse_id = $2 ORDER BY batch_id`, [sku.id, warehouse.id]
    );
    const byBatch = new Map(balancesAfterPost.rows.map((row) => [row.batch_id, Number(row.quantity_on_hand)]));
    assert.equal(byBatch.get(batches[0].id), 0);
    assert.equal(byBatch.get(batches[1].id), 40);
    assert.equal(byBatch.get(batches[2].id), 50);

    const postedKey = (await client.query(
      'SELECT idempotency_key FROM outbound.goods_issue WHERE id = $1', [posted.id]
    )).rows[0].idempotency_key;
    const replay = await service.postGoodsIssue(
      creator.id,
      createResult.id,
      task.issueRequestVersion,
      postedKey,
      correlationId
    );
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.movementIds, posted.movementIds);

    const overrideDraft = await service.createIssueRequest(creator.id, {
      issueCode: `IR_OVERRIDE_${suffix}`,
      warehouseId: warehouse.id,
      salesChannel: 'WHOLESALE',
      lines: [{ skuId: sku.id, quantity: 10 }]
    }, randomUUID(), correlationId);
    const overrideSubmitted = await service.submitIssueRequest(creator.id, overrideDraft.id, overrideDraft.version, correlationId);
    const overrideApproved = await service.approveIssueRequest(approver.id, overrideDraft.id, overrideSubmitted.version, correlationId);
    const overrideLine = (await client.query(
      'SELECT id FROM outbound.issue_request_line WHERE issue_request_id = $1', [overrideDraft.id]
    )).rows[0];
    const overrideKey = randomUUID();
    const manualSelection = {
      expectedVersion: overrideApproved.version,
      overrideReason: 'Customer requires this production lot',
      selections: [{ lineId: overrideLine.id, batchId: batches[2].id, locationId: locations[2].id, quantity: 10 }]
    };
    await assert.rejects(
      service.allocateIssueRequest(creator.id, overrideDraft.id, manualSelection, overrideKey, correlationId),
      (error) => error instanceof ForbiddenException
    );
    await client.query(
      `INSERT INTO iam.role_permission (role_id, permission_id, granted_by)
       SELECT $1, id, $2 FROM iam.permission WHERE code = 'OUTBOUND.FEFO_OVERRIDE'`,
      [role.id, approver.id]
    );
    const overridden = await service.allocateIssueRequest(
      creator.id,
      overrideDraft.id,
      manualSelection,
      overrideKey,
      correlationId
    );
    assert.equal(overridden.allocations[0].batch_id, batches[2].id);
    assert.equal(overridden.allocations[0].override_used, true);
    await service.cancelIssueRequest(
      creator.id,
      overrideDraft.id,
      overridden.version,
      correlationId,
      'Integration override cleanup'
    );

    const concurrent = [];
    for (const index of [1, 2]) {
      const draft = await service.createIssueRequest(creator.id, {
        issueCode: `IR_CONCURRENT_${index}_${suffix}`,
        warehouseId: warehouse.id,
        salesChannel: 'WHOLESALE',
        lines: [{ skuId: sku.id, quantity: 60 }]
      }, randomUUID(), correlationId);
      const submit = await service.submitIssueRequest(creator.id, draft.id, draft.version, correlationId);
      const approve = await service.approveIssueRequest(approver.id, draft.id, submit.version, correlationId);
      concurrent.push({ id: draft.id, version: approve.version, key: randomUUID() });
    }
    const allocationResults = await Promise.allSettled(concurrent.map((command) =>
      service.allocateIssueRequest(
        creator.id,
        command.id,
        { expectedVersion: command.version },
        command.key,
        correlationId
      )
    ));
    assert.equal(allocationResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(allocationResults.filter((result) => result.status === 'rejected').length, 1);
    const activeReservation = await client.query(
      `SELECT coalesce(sum(quantity_reserved - quantity_fulfilled - quantity_released),0)::bigint AS quantity
       FROM inventory.inventory_reservation
       WHERE sku_id = $1 AND warehouse_id = $2 AND status = 'ACTIVE'`, [sku.id, warehouse.id]
    );
    assert.equal(Number(activeReservation.rows[0].quantity), 60);
    const atp = await client.query(
      'SELECT atp FROM inventory.atp_by_sku_warehouse WHERE sku_id = $1 AND warehouse_id = $2',
      [sku.id, warehouse.id]
    );
    assert.equal(Number(atp.rows[0].atp), 30);

    for (const command of concurrent) {
      const state = (await client.query(
        'SELECT version FROM outbound.issue_request WHERE id = $1', [command.id]
      )).rows[0];
      await service.cancelIssueRequest(
        creator.id,
        command.id,
        state.version,
        correlationId,
        'Integration concurrency cleanup'
      );
    }

    const evidence = await client.query(
      `SELECT
         (SELECT count(*) FROM audit.audit_event WHERE resource_type = 'GOODS_ISSUE' AND resource_id = $1::text) AS audit_count,
         (SELECT count(*) FROM platform.outbox_event WHERE aggregate_type = 'GOODS_ISSUE' AND aggregate_id = $2::uuid) AS outbox_count,
         (SELECT count(*) FROM inventory.ledger_balance_reconciliation WHERE sku_id = $3::uuid AND variance <> 0) AS variance_count`,
      [posted.id, posted.id, sku.id]
    );
    assert.equal(Number(evidence.rows[0].audit_count), 1);
    assert.equal(Number(evidence.rows[0].outbox_count), 1);
    assert.equal(Number(evidence.rows[0].variance_count), 0);
  } finally {
    await client.end();
    await outboundDb.onModuleDestroy();
  }
});
