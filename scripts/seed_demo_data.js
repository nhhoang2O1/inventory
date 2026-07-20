import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

async function seed() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to database for seeding demo data...');

  try {
    await client.query('BEGIN');

    // 1. UOM
    const uomRes = await client.query(`
      INSERT INTO catalog.unit_of_measure (id, code, name, whole_case_only)
      VALUES ('5503225a-7e1d-40c9-b2b5-59a471963acb', 'CASE', 'Case', true)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const caseUomId = '5503225a-7e1d-40c9-b2b5-59a471963acb';

    // 2. Category
    const catRes = await client.query(`
      INSERT INTO catalog.category (code, name, status)
      VALUES 
        ('BIA', 'Bia các loại', 'ACTIVE'),
        ('NUOC_NGOT', 'Nước ngọt & Nước khoáng', 'ACTIVE')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, code
    `);
    const categories = {};
    for (const r of catRes.rows) {
      categories[r.code] = r.id;
    }

    // Lookup categories if not returned due to ON CONFLICT
    if (!categories['BIA'] || !categories['NUOC_NGOT']) {
      const allCats = await client.query('SELECT id, code FROM catalog.category');
      for (const r of allCats.rows) {
        categories[r.code] = r.id;
      }
    }

    // 3. Brand
    const brandRes = await client.query(`
      INSERT INTO catalog.brand (code, name, status)
      VALUES 
        ('HEINEKEN', 'Heineken', 'ACTIVE'),
        ('TIGER', 'Tiger', 'ACTIVE'),
        ('COCA_COLA', 'Coca-Cola', 'ACTIVE'),
        ('PEPSI', 'Pepsi', 'ACTIVE')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, code
    `);
    const brands = {};
    for (const r of brandRes.rows) {
      brands[r.code] = r.id;
    }
    if (Object.keys(brands).length < 4) {
      const allBrands = await client.query('SELECT id, code FROM catalog.brand');
      for (const r of allBrands.rows) {
        brands[r.code] = r.id;
      }
    }

    // 4. Manufacturer
    const mfgRes = await client.query(`
      INSERT INTO catalog.manufacturer (code, name, country_code, status)
      VALUES 
        ('HEINEKEN_VN', 'Công ty TNHH Nhà Máy Bia Heineken Việt Nam', 'VN', 'ACTIVE'),
        ('COCA_COLA_VN', 'Công ty TNHH Nước Giải Khát Coca-Cola Việt Nam', 'VN', 'ACTIVE'),
        ('PEPSI_VN', 'Công ty TNHH Nước Giải Khát Suntory PepsiCo Việt Nam', 'VN', 'ACTIVE')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, code
    `);
    const mfgs = {};
    for (const r of mfgRes.rows) {
      mfgs[r.code] = r.id;
    }
    if (Object.keys(mfgs).length < 3) {
      const allMfgs = await client.query('SELECT id, code FROM catalog.manufacturer');
      for (const r of allMfgs.rows) {
        mfgs[r.code] = r.id;
      }
    }

    // 5. Product
    const productsToInsert = [
      { code: 'HEINEKEN_SILVER', name: 'Heineken Silver Can/Bottle', cat: 'BIA', brand: 'HEINEKEN', mfg: 'HEINEKEN_VN' },
      { code: 'HEINEKEN_ORIGINAL', name: 'Heineken Original Can/Bottle', cat: 'BIA', brand: 'HEINEKEN', mfg: 'HEINEKEN_VN' },
      { code: 'TIGER_CRYSTAL', name: 'Tiger Crystal Can/Bottle', cat: 'BIA', brand: 'TIGER', mfg: 'HEINEKEN_VN' },
      { code: 'COCA_COLA_CAN', name: 'Coca-Cola Lon 320ml', cat: 'NUOC_NGOT', brand: 'COCA_COLA', mfg: 'COCA_COLA_VN' },
      { code: 'PEPSI_CAN', name: 'Pepsi Lon 320ml', cat: 'NUOC_NGOT', brand: 'PEPSI', mfg: 'PEPSI_VN' }
    ];

    const products = {};
    for (const p of productsToInsert) {
      const res = await client.query(`
        INSERT INTO catalog.product (code, name, category_id, brand_id, manufacturer_id, status, version)
        VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 1)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, code
      `, [p.code, p.name, categories[p.cat], brands[p.brand], mfgs[p.mfg]]);
      products[p.code] = res.rows[0]?.id;
    }
    if (Object.keys(products).length < 5) {
      const allProds = await client.query('SELECT id, code FROM catalog.product');
      for (const r of allProds.rows) {
        products[r.code] = r.id;
      }
    }

    // 6. SKU
    const skusToInsert = [
      { code: 'SKU-HN-330-CAN', name: 'Heineken Silver 330ml Can (T24)', prod: 'HEINEKEN_SILVER', beverageType: 'BEER', volume: 330, carbonated: true },
      { code: 'SKU-HN-330-BTL', name: 'Heineken Original 330ml Bottle (K20)', prod: 'HEINEKEN_ORIGINAL', beverageType: 'BEER', volume: 330, carbonated: true },
      { code: 'SKU-TIG-330-CAN', name: 'Tiger Crystal 330ml Can (T24)', prod: 'TIGER_CRYSTAL', beverageType: 'BEER', volume: 330, carbonated: true },
      { code: 'SKU-TIG-330-BTL', name: 'Tiger Crystal 330ml Chai (K24)', prod: 'TIGER_CRYSTAL', beverageType: 'BEER', volume: 330, carbonated: true },
      { code: 'SKU-COCA-320-CAN', name: 'Coca Cola 320ml Can (T24)', prod: 'COCA_COLA_CAN', beverageType: 'SOFT_DRINK', volume: 320, carbonated: true },
      { code: 'SKU-PEPSI-320-CAN', name: 'Pepsi 320ml Can (T24)', prod: 'PEPSI_CAN', beverageType: 'SOFT_DRINK', volume: 320, carbonated: true }
    ];

    const skus = {};
    for (const s of skusToInsert) {
      const res = await client.query(`
        INSERT INTO catalog.sku (product_id, code, name, base_uom_id, beverage_type, volume_ml, carbonated, status, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 1)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, code
      `, [products[s.prod], s.code, s.name, caseUomId, s.beverageType, s.volume, s.carbonated]);
      skus[s.code] = res.rows[0]?.id || (await client.query('SELECT id FROM catalog.sku WHERE code = $1', [s.code])).rows[0].id;

      // Packaging Specification
      await client.query(`
        INSERT INTO catalog.packaging_specification (sku_id, units_per_case, unit_volume_ml, gross_weight_kg, length_cm, width_cm, height_cm, valid_from)
        VALUES ($1, $2, $3, $4, 40.0, 30.0, 25.0, NOW() - interval '30 days')
        ON CONFLICT (sku_id) WHERE valid_until IS NULL DO UPDATE SET units_per_case = EXCLUDED.units_per_case
      `, [skus[s.code], s.code.includes('BTL') ? 20 : 24, s.volume, s.code.includes('BTL') ? 14.5 : 9.5]);

      // Barcode
      const barcodeVal = s.code === 'SKU-HN-330-CAN' ? '8934588012112' : 
                         s.code === 'SKU-HN-330-BTL' ? '8934588012129' :
                         s.code === 'SKU-TIG-330-CAN' ? '8934588022111' :
                         s.code === 'SKU-TIG-330-BTL' ? '8934588022128' :
                         s.code === 'SKU-COCA-320-CAN' ? '8930008010113' : '8930008020112';
      await client.query(`
        INSERT INTO catalog.barcode (sku_id, value, symbology, valid_from)
        VALUES ($1, $2, 'EAN13', NOW() - interval '30 days')
        ON CONFLICT (value) WHERE valid_until IS NULL DO NOTHING
      `, [skus[s.code], barcodeVal]);
    }

    // 7. Supplier
    const supplierRes = await client.query(`
      INSERT INTO purchasing.supplier (code, name, phone, standard_lead_time_days, status)
      VALUES ('HEINEKEN_VN_SUP', 'Heineken Vietnam N.V Supplier', '02838222755', 5, 'ACTIVE')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const supplierId = supplierRes.rows[0]?.id || (await client.query("SELECT id FROM purchasing.supplier WHERE code = 'HEINEKEN_VN_SUP'")).rows[0].id;

    // Wholesale Quantity Policies
    for (const skuCode of Object.keys(skus)) {
      const skuId = skus[skuCode];
      await client.query(`
        INSERT INTO catalog.wholesale_quantity_policy (sku_id, direction, supplier_id, minimum_quantity, valid_from)
        VALUES ($1, 'INBOUND', $2, 10, NOW() - interval '30 days')
        ON CONFLICT DO NOTHING
      `, [skuId, supplierId]);
      await client.query(`
        INSERT INTO catalog.wholesale_quantity_policy (sku_id, direction, minimum_quantity, valid_from)
        VALUES ($1, 'OUTBOUND', 10, NOW() - interval '30 days')
        ON CONFLICT DO NOTHING
      `, [skuId]);
    }

    // 8. Warehouses setup
    const warehouses = await client.query("SELECT id, code FROM warehouse.warehouse WHERE code IN ('KHO-A', 'KHO-B', 'KHO-C')");
    
    for (const wh of warehouses.rows) {
      const whId = wh.id;
      const whCode = wh.code;

      // Zones
      const zonesToInsert = [
        { code: 'RECEIVING', name: 'Khu vực nhận hàng', type: 'RECEIVING' },
        { code: 'STORAGE', name: 'Khu vực lưu trữ chính', type: 'STORAGE' },
        { code: 'PICKING', name: 'Khu vực bốc xếp', type: 'PICKING' },
        { code: 'QUARANTINE', name: 'Khu vực kiểm định', type: 'QUARANTINE' },
        { code: 'DAMAGED', name: 'Khu vực hàng hủy', type: 'DAMAGED' }
      ];

      const zones = {};
      for (const z of zonesToInsert) {
        const zRes = await client.query(`
          INSERT INTO warehouse.zone (warehouse_id, code, name, zone_type, status)
          VALUES ($1, $2, $3, $4, 'ACTIVE')
          ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name
          RETURNING id, code
        `, [whId, z.code, z.name, z.type]);
        zones[z.code] = zRes.rows[0]?.id || (await client.query('SELECT id FROM warehouse.zone WHERE warehouse_id = $1 AND code = $2', [whId, z.code])).rows[0].id;
      }

      // Locations
      const locationsToInsert = [
        { code: 'LOC-REC', zone: 'RECEIVING', type: 'SINGLE_SKU' },
        { code: 'Z1-A12', zone: 'STORAGE', type: 'SINGLE_SKU' },
        { code: 'Z2-B04', zone: 'STORAGE', type: 'SINGLE_SKU' },
        { code: 'Z3-C01', zone: 'STORAGE', type: 'SINGLE_SKU' },
        { code: 'LOC-QUAR', zone: 'QUARANTINE', type: 'SINGLE_SKU' },
        { code: 'LOC-DAMG', zone: 'DAMAGED', type: 'SINGLE_SKU' }
      ];

      const locations = {};
      for (const loc of locationsToInsert) {
        const lRes = await client.query(`
          INSERT INTO warehouse.location (zone_id, code, barcode, mixing_policy, status)
          VALUES ($1, $2, $3, $4, 'ACTIVE')
          ON CONFLICT (zone_id, code) DO UPDATE SET status = EXCLUDED.status
          RETURNING id, code
        `, [zones[loc.zone], loc.code, `${whCode}-${loc.code}`, loc.type]);
        locations[loc.code] = lRes.rows[0]?.id || (await client.query('SELECT id FROM warehouse.location WHERE zone_id = $1 AND code = $2', [zones[loc.zone], loc.code])).rows[0].id;
      }

      // 9. Batches & Balances
      // Clean up previous balances for this warehouse first
      await client.query('DELETE FROM inventory.inventory_balance WHERE warehouse_id = $1', [whId]);

      // Batches
      const batches = [
        { code: 'B-HN-SILVER-01', sku: 'SKU-HN-330-CAN', mfg: '2026-06-01', exp: '2027-06-01' },
        { code: 'B-HN-ORIG-01', sku: 'SKU-HN-330-BTL', mfg: '2026-06-01', exp: '2027-06-01' },
        { code: 'B-TIG-CRYST-01', sku: 'SKU-TIG-330-CAN', mfg: '2026-06-01', exp: '2027-06-01' },
        { code: 'B-HN-SILVER-NEAR-EXP', sku: 'SKU-HN-330-CAN', mfg: '2025-10-01', exp: '2026-08-05' },
        { code: 'B-HN-SILVER-EXP', sku: 'SKU-HN-330-CAN', mfg: '2025-06-01', exp: '2026-06-01' },
        { code: 'B-COCA-320-01', sku: 'SKU-COCA-320-CAN', mfg: '2026-05-01', exp: '2027-05-01' },
        { code: 'B-PEPSI-320-01', sku: 'SKU-PEPSI-320-CAN', mfg: '2026-05-01', exp: '2027-05-01' },
        { code: 'B-TIG-CRYST-BTL-01', sku: 'SKU-TIG-330-BTL', mfg: '2026-06-01', exp: '2027-06-01' }
      ];

      for (const b of batches) {
        const bRes = await client.query(`
          INSERT INTO inventory.batch (sku_id, batch_code, manufacturing_date, expiration_date)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (sku_id, batch_code) DO UPDATE SET expiration_date = EXCLUDED.expiration_date
          RETURNING id
        `, [skus[b.sku], b.code, b.mfg, b.exp]);
        const batchId = bRes.rows[0]?.id || (await client.query('SELECT id FROM inventory.batch WHERE sku_id = $1 AND batch_code = $2', [skus[b.sku], b.code])).rows[0].id;

        // Warehouse-specific Balances
        if (whCode === 'KHO-A') {
          if (b.code === 'B-HN-SILVER-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 250, 1)`, [skus[b.sku], batchId, whId, locations['Z1-A12']]);
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'QUARANTINED', 50, 1)`, [skus[b.sku], batchId, whId, locations['LOC-QUAR']]);
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'DAMAGED', 15, 1)`, [skus[b.sku], batchId, whId, locations['LOC-DAMG']]);
          } else if (b.code === 'B-HN-ORIG-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 180, 1)`, [skus[b.sku], batchId, whId, locations['Z2-B04']]);
          } else if (b.code === 'B-TIG-CRYST-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 300, 1)`, [skus[b.sku], batchId, whId, locations['Z3-C01']]);
          } else if (b.code === 'B-HN-SILVER-NEAR-EXP') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 80, 1)`, [skus[b.sku], batchId, whId, locations['Z1-A12']]);
          } else if (b.code === 'B-HN-SILVER-EXP') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'EXPIRED', 30, 1)`, [skus[b.sku], batchId, whId, locations['LOC-DAMG']]);
          }
        } else if (whCode === 'KHO-B') {
          if (b.code === 'B-COCA-320-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 350, 1)`, [skus[b.sku], batchId, whId, locations['Z1-A12']]);
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'DAMAGED', 10, 1)`, [skus[b.sku], batchId, whId, locations['LOC-DAMG']]);
          } else if (b.code === 'B-PEPSI-320-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 280, 1)`, [skus[b.sku], batchId, whId, locations['Z2-B04']]);
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'QUARANTINED', 25, 1)`, [skus[b.sku], batchId, whId, locations['LOC-QUAR']]);
          } else if (b.code === 'B-TIG-CRYST-BTL-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 120, 1)`, [skus[b.sku], batchId, whId, locations['Z3-C01']]);
          }
        } else if (whCode === 'KHO-C') {
          if (b.code === 'B-HN-SILVER-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 500, 1)`, [skus[b.sku], batchId, whId, locations['Z1-A12']]);
          } else if (b.code === 'B-COCA-320-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 450, 1)`, [skus[b.sku], batchId, whId, locations['Z2-B04']]);
          } else if (b.code === 'B-TIG-CRYST-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'AVAILABLE', 600, 1)`, [skus[b.sku], batchId, whId, locations['Z3-C01']]);
          } else if (b.code === 'B-HN-ORIG-01') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'QUARANTINED', 100, 1)`, [skus[b.sku], batchId, whId, locations['LOC-QUAR']]);
          } else if (b.code === 'B-HN-SILVER-EXP') {
            await client.query(`INSERT INTO inventory.inventory_balance (sku_id, batch_id, warehouse_id, location_id, stock_status, quantity_on_hand, version) VALUES ($1, $2, $3, $4, 'EXPIRED', 40, 1)`, [skus[b.sku], batchId, whId, locations['LOC-DAMG']]);
          }
        }
      }

      // 10. Purchase Orders
      // Seed a couple of active DRAFT or APPROVED purchase orders for receiving in this warehouse
      const orderDate = new Date().toISOString().split('T')[0];
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 5);

      const poCode = `PO-${whCode}-${Date.now().toString().slice(-6)}`;
      
      const managerUserRes = await client.query("SELECT id FROM iam.app_user WHERE username = 'manager'");
      const managerId = managerUserRes.rows[0].id;

      const poRes = await client.query(`
        INSERT INTO purchasing.purchase_order (po_code, supplier_id, status, order_date, expected_delivery_date, created_by)
        VALUES ($1, $2, 'APPROVED', $3, $4, $5)
        RETURNING id
      `, [poCode, supplierId, orderDate, deliveryDate, managerId]);
      const poId = poRes.rows[0].id;

      // Lines
      await client.query(`
        INSERT INTO purchasing.purchase_order_line (po_id, sku_id, ordered_qty, received_qty, uom_id, unit_price)
        VALUES ($1, $2, 100, 0, $3, 220000)
      `, [poId, skus['SKU-HN-330-CAN'], caseUomId]);
      
      await client.query(`
        INSERT INTO purchasing.purchase_order_line (po_id, sku_id, ordered_qty, received_qty, uom_id, unit_price)
        VALUES ($1, $2, 150, 0, $3, 240000)
      `, [poId, skus['SKU-HN-330-BTL'], caseUomId]);

      // Seed a Reorder Policy for this warehouse
      const policyIdempotencyKey = `POLICY-${whCode}-${Date.now().toString().slice(-6)}`;
      const requestHash = 'a'.repeat(64);
      await client.query(`
        INSERT INTO planning.reorder_policy (warehouse_id, sku_id, supplier_id, lead_time_days, safety_stock_quantity, coverage_days, sales_window_days, order_multiple, minimum_stock_quantity, maximum_stock_quantity, status, valid_from, created_by, idempotency_key, request_hash, correlation_id)
        VALUES ($1, $2, $3, 5, 20, 15, 30, 10, 50, 200, 'ACTIVE', NOW()::date - 30, $4, $5, $6, gen_random_uuid())
        ON CONFLICT DO NOTHING
      `, [whId, skus['SKU-HN-330-CAN'], supplierId, managerId, policyIdempotencyKey, requestHash]);
    }

    await client.query('COMMIT');
    console.log('Demo data successfully seeded for KHO-A, KHO-B, and KHO-C!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', err);
  } finally {
    await client.end();
  }
}

seed();
