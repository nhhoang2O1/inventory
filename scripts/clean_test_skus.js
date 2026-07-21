import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';

async function clean() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to database to clean test SKUs...');

  const officialCodes = [
    'SKU-HN-330-CAN',
    'SKU-HN-330-BTL',
    'SKU-TIG-330-CAN',
    'SKU-TIG-330-BTL',
    'SKU-COCA-320-CAN',
    'SKU-PEPSI-320-CAN'
  ];

  try {
    await client.query('BEGIN');

    // Deactivate test SKUs that contain 'test', 'Phase', 'SKU_' (with underscore), or 'SP' by setting status = 'INACTIVE'
    const deactivatedRes = await client.query(
      `UPDATE catalog.sku 
       SET status = 'INACTIVE' 
       WHERE (code LIKE 'SKU\\_%' ESCAPE '\\' OR name ILIKE '%test%' OR name ILIKE '%Phase%' OR code LIKE 'SP%')
         AND code NOT IN ($1, $2, $3, $4, $5, $6)
       RETURNING id, code, name`,
      officialCodes
    );

    console.log(`Set ${deactivatedRes.rowCount} test SKUs to INACTIVE:`, deactivatedRes.rows.map(r => `${r.code} (${r.name})`));

    // Ensure official SKUs are ACTIVE with accurate names
    const officialUpdates = [
      { code: 'SKU-HN-330-CAN', name: 'Heineken Silver 330ml Can (T24)' },
      { code: 'SKU-HN-330-BTL', name: 'Heineken Original 330ml Bottle (K20)' },
      { code: 'SKU-TIG-330-CAN', name: 'Tiger Crystal 330ml Can (T24)' },
      { code: 'SKU-TIG-330-BTL', name: 'Tiger Crystal 330ml Chai (K24)' },
      { code: 'SKU-COCA-320-CAN', name: 'Coca Cola 320ml Can (T24)' },
      { code: 'SKU-PEPSI-320-CAN', name: 'Pepsi 320ml Can (T24)' }
    ];

    for (const item of officialUpdates) {
      await client.query(
        `UPDATE catalog.sku SET status = 'ACTIVE', name = $2 WHERE code = $1`,
        [item.code, item.name]
      );
    }

    await client.query('COMMIT');
    console.log('Cleaned up and updated official SKUs successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cleaning test SKUs:', err);
  } finally {
    await client.end();
  }
}

clean();
