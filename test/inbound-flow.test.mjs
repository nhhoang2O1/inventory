import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import pg from 'pg';
import { ConflictException } from '@nestjs/common';

// Dynamic Env Loader for local running
try {
  const envContent = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of envContent.split('\n')) {
    const parts = line.trim().split('=');
    if (parts.length >= 2 && !parts[0].startsWith('#')) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  // Ignore in CI where environment variables are pre-configured
}

import { SupplierService } from '../apps/api/dist/modules/purchasing/public/supplier.service.js';
import { PurchaseOrderService } from '../apps/api/dist/modules/purchasing/public/purchase-order.service.js';
import { PurchasingDatabaseService } from '../apps/api/dist/modules/purchasing/public/purchasing-database.service.js';
import { GoodsReceiptService } from '../apps/api/dist/modules/receiving/public/goods-receipt.service.js';
import { ReceivingDatabaseService } from '../apps/api/dist/modules/receiving/public/receiving-database.service.js';

const { Client } = pg;
const migration10Url = new URL('../packages/database/migrations/0010_phase5_inbound.sql', import.meta.url);
const migration11Url = new URL('../packages/database/migrations/0011_phase5_mrsl_policy.sql', import.meta.url);
const sql10 = await readFile(migration10Url, 'utf8');
const sql11 = await readFile(migration11Url, 'utf8');

// --- 1. Static Analysis Tests ---

test('Phase 5 Inbound Migration has correct schemas and tables', () => {
  assert.match(sql10, /CREATE SCHEMA IF NOT EXISTS purchasing/);
  assert.match(sql10, /CREATE SCHEMA IF NOT EXISTS receiving/);
  assert.match(sql10, /CREATE TABLE purchasing\.supplier/);
  assert.match(sql10, /CREATE TABLE purchasing\.purchase_order/);
  assert.match(sql10, /CREATE TABLE purchasing\.purchase_order_line/);
  assert.match(sql10, /CREATE TABLE receiving\.goods_receipt/);
  assert.match(sql10, /CREATE TABLE receiving\.goods_receipt_line/);
});

test('Phase 5 Inbound Migration enforces constraints and double-entry/audit invariants', () => {
  assert.match(sql10, /CONSTRAINT ck_received_qty_limit CHECK \(received_qty <= ordered_qty \* 1\.10\)/);
  assert.match(sql10, /CHECK \(ordered_qty > 0\)/);
  assert.match(sql10, /CHECK \(quantity > 0\)/);
  assert.match(sql10, /po_id uuid NOT NULL REFERENCES purchasing\.purchase_order\(id\) ON DELETE CASCADE/);
});

test('MRSL policy table is defined with valid-from range constraints', () => {
  assert.match(sql11, /CREATE TABLE receiving\.mrsl_policy/);
  assert.match(sql11, /CHECK \(valid_until IS NULL OR valid_until > valid_from\)/);
  assert.match(sql11, /exception_mode text NOT NULL DEFAULT 'REJECT' CHECK \(exception_mode IN \('REJECT', 'QUARANTINE', 'ALLOW_WITH_APPROVAL'\)\)/);
});

// --- 2. Live Database Integration Tests ---

const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

test('Integration: Purchasing and Receiving E2E Flow', async () => {
  const client = new Client({ connectionString });
  await client.connect();

  // Create clean isolated db services
  const purchasingDb = new PurchasingDatabaseService();
  const receivingDb = new ReceivingDatabaseService();

  const supplierService = new SupplierService(purchasingDb);
  const poService = new PurchaseOrderService(purchasingDb);
  const grService = new GoodsReceiptService(receivingDb);

  // Setup seed IDs
  let roleId, userId, categoryId, brandId, manufacturerId, productId, skuId, uomId, whId, zoneId, locationId, batchId, poResult, supplierResult;
  const supplierCode = `TEST_SUPP_${Date.now()}`;
  const poCode = `TEST_PO_${Date.now()}`;
  const grCode = `TEST_GR_${Date.now()}`;
  const idempotencyKey = `KEY_${Date.now()}`;
  const correlationId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  try {
    // 1. Seed base IAM and master data directly
    const roleRes = await client.query(
      `INSERT INTO iam.role (code, name, is_system) 
       VALUES ($1, $2, true) 
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      ['TEST_ROLE_INBOUND', 'Test Role Inbound']
    );
    roleId = roleRes.rows[0].id;

    const userRes = await client.query(
      `INSERT INTO iam.app_user (username, display_name, role_id, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
      ['test_inbound_user', 'Test Inbound User', roleId, 'mock_hash']
    );
    userId = userRes.rows[0].id;

    const uomRes = await client.query(
      `INSERT INTO catalog.unit_of_measure (code, name)
       VALUES ('CASE', 'Case')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    uomId = uomRes.rows[0].id;

    const catRes = await client.query(
      `INSERT INTO catalog.category (code, name)
       VALUES ('BEER_TEST', 'Beer Test')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    categoryId = catRes.rows[0].id;

    const brandRes = await client.query(
      `INSERT INTO catalog.brand (code, name)
       VALUES ('TEST_BRAND', 'Test Brand')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    brandId = brandRes.rows[0].id;

    const manuRes = await client.query(
      `INSERT INTO catalog.manufacturer (code, name)
       VALUES ('TEST_MANU', 'Test Manu')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    manufacturerId = manuRes.rows[0].id;

    const prodRes = await client.query(
      `INSERT INTO catalog.product (code, name, category_id, brand_id, manufacturer_id)
       VALUES ('TEST_PRODUCT', 'Test Product', $1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [categoryId, brandId, manufacturerId]
    );
    productId = prodRes.rows[0].id;

    const skuRes = await client.query(
      `INSERT INTO catalog.sku (product_id, code, name, base_uom_id)
       VALUES ($1, 'TEST_SKU', 'Test SKU', $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [productId, uomId]
    );
    skuId = skuRes.rows[0].id;

    // Reset inventory balance to ensure a clean 0 baseline for the test
    await client.query('DELETE FROM inventory.inventory_balance WHERE sku_id = $1', [skuId]);

    const whRes = await client.query(
      `INSERT INTO warehouse.warehouse (code, name)
       VALUES ('WH_TEST', 'WH Test')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    whId = whRes.rows[0].id;

    const zoneRes = await client.query(
      `INSERT INTO warehouse.zone (warehouse_id, code, name)
       VALUES ($1, 'Z_TEST', 'Zone Test')
       ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [whId]
    );
    zoneId = zoneRes.rows[0].id;

    const locRes = await client.query(
      `INSERT INTO warehouse.location (zone_id, code)
       VALUES ($1, 'LOC_TEST')
       ON CONFLICT (zone_id, code) DO UPDATE SET code = EXCLUDED.code RETURNING id`,
      [zoneId]
    );
    locationId = locRes.rows[0].id;

    // Grant user warehouse access
    await client.query(
      `INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [userId, whId]
    );

    // Create a batch (MFG < EXP)
    const batchRes = await client.query(
      `INSERT INTO inventory.batch (sku_id, batch_code, manufacturing_date, expiration_date)
       VALUES ($1, 'B_TEST_01', '2026-01-01', '2026-12-31')
       ON CONFLICT (sku_id, batch_code) DO UPDATE SET expiration_date = EXCLUDED.expiration_date RETURNING id`,
      [skuId]
    );
    batchId = batchRes.rows[0].id;

    // 2. Test Supplier Creation
    supplierResult = await supplierService.create({
      code: supplierCode,
      name: 'Test Supplier Inbound',
      phone: '0987654321',
      standardLeadTimeDays: 5
    });
    assert.ok(supplierResult.id);

    // 3. Test PO Creation (calculating expected delivery date)
    const orderDateStr = '2026-07-18';
    poResult = await poService.create(userId, {
      poCode,
      supplierId: supplierResult.id,
      orderDate: orderDateStr,
      lines: [
        { skuId, orderedQty: 100, uomId, unitPrice: 25000 }
      ]
    });
    assert.ok(poResult.id);
    
    // Verify lead time addition: Order Date 2026-07-18 + 5 days standard_lead_time_days = 2026-07-23
    const expectedDelivery = new Date(poResult.expectedDeliveryDate);
    assert.strictEqual(expectedDelivery.toISOString().split('T')[0], '2026-07-23');

    // 4. Test PO Approval
    const approveResult = await poService.approve(userId, poResult.id);
    assert.strictEqual(approveResult.status, 'APPROVED');

    // Fetch PO details and retrieve the PO line ID
    const poDetails = await poService.findOne(poResult.id);
    assert.strictEqual(poDetails.status, 'APPROVED');
    const poLineId = poDetails.lines[0].id;

    // 5. Test MRSL Policy rejection
    // Insert a MRSL policy requiring 200 days remaining
    await client.query(
      `INSERT INTO receiving.mrsl_policy (sku_id, min_remaining_days, exception_mode, valid_from)
       VALUES ($1, 200, 'REJECT', now())`,
      [skuId]
    );

    // Create a batch that expires in 50 days (violates the 200 days requirement)
    const shortBatchRes = await client.query(
      `INSERT INTO inventory.batch (sku_id, batch_code, manufacturing_date, expiration_date)
       VALUES ($1, 'B_TEST_SHORT', '2026-01-01', '2026-09-01')
       ON CONFLICT (sku_id, batch_code) DO UPDATE SET expiration_date = EXCLUDED.expiration_date RETURNING id`,
      [skuId]
    );
    const shortBatchId = shortBatchRes.rows[0].id;

    // Create Goods Receipt (DRAFT)
    const grResultFail = await grService.create(userId, {
      grCode: `${grCode}_FAIL`,
      poId: poResult.id,
      receivedDate: '2026-07-18T00:00:00Z',
      idempotencyKey: `${idempotencyKey}_FAIL`,
      lines: [
        { poLineId, skuId, batchId: shortBatchId, quantity: 50, uomId, locationId, stockStatus: 'AVAILABLE' }
      ]
    });

    // Try posting GR; expect MRSL validation to throw ConflictException
    await assert.rejects(
      async () => {
        await grService.post(userId, grResultFail.id, correlationId);
      },
      (err) => {
        return err instanceof ConflictException && err.message.includes('MRSL validation failed');
      }
    );

    // Remove the temporary MRSL policy so we can test other paths
    await client.query('DELETE FROM receiving.mrsl_policy WHERE sku_id = $1', [skuId]);

    // 6. Test PO tolerance check (Max 10% receipt overflow)
    const grResultTolerance = await grService.create(userId, {
      grCode: `${grCode}_TOL`,
      poId: poResult.id,
      receivedDate: '2026-07-18T00:00:00Z',
      idempotencyKey: `${idempotencyKey}_TOL`,
      lines: [
        { poLineId, skuId, batchId, quantity: 120, uomId, locationId, stockStatus: 'AVAILABLE' } // 120 > 110 (110%)
      ]
    });

    await assert.rejects(
      async () => {
        await grService.post(userId, grResultTolerance.id, correlationId);
      },
      (err) => {
        return err instanceof ConflictException && err.message.includes('exceeds ordered quantity plus tolerance');
      }
    );

    // 7. Test Successful Goods Receipt posting (e.g. 50 items received)
    const grResultSuccess = await grService.create(userId, {
      grCode,
      poId: poResult.id,
      receivedDate: '2026-07-18T00:00:00Z',
      idempotencyKey,
      lines: [
        { poLineId, skuId, batchId, quantity: 50, uomId, locationId, stockStatus: 'AVAILABLE' }
      ]
    });

    const postResult = await grService.post(userId, grResultSuccess.id, correlationId);
    assert.strictEqual(postResult.status, 'POSTED');
    assert.strictEqual(postResult.movementIds.length, 1);

    // Verify PO status updated to PARTIALLY_RECEIVED
    const poAfterPost = await poService.findOne(poResult.id);
    assert.strictEqual(poAfterPost.status, 'PARTIALLY_RECEIVED');
    assert.strictEqual(poAfterPost.lines[0].receivedQty, 50);

    // Verify inventory balance is successfully updated
    const balanceRows = await client.query(
      `SELECT quantity_on_hand FROM inventory.inventory_balance
       WHERE sku_id = $1 AND batch_id = $2 AND warehouse_id = $3 AND location_id = $4`,
      [skuId, batchId, whId, locationId]
    );
    assert.strictEqual(Number(balanceRows.rows[0].quantity_on_hand), 50);

  } finally {
    // Cleanup PO and GR
    if (skuId) {
      await client.query('DELETE FROM receiving.goods_receipt_line WHERE sku_id = $1', [skuId]);
      await client.query('DELETE FROM purchasing.purchase_order_line WHERE sku_id = $1', [skuId]);
      await client.query('DELETE FROM receiving.mrsl_policy WHERE sku_id = $1', [skuId]);
      await client.query('DELETE FROM inventory.inventory_balance WHERE sku_id = $1', [skuId]);
    }
    if (poResult?.id) {
      await client.query('DELETE FROM receiving.goods_receipt WHERE po_id = $1 OR gr_code LIKE \'TEST_GR_%\'', [poResult.id]);
      await client.query('DELETE FROM purchasing.purchase_order WHERE id = $1', [poResult.id]);
    }
    if (supplierResult?.id) {
      await client.query('DELETE FROM purchasing.supplier WHERE id = $1', [supplierResult.id]);
    }

    await client.end();
    await purchasingDb.onModuleDestroy();
    await receivingDb.onModuleDestroy();
  }
});
