import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/wms_db'
});

async function main() {
  try {
    // 1. Ensure permissions exist
    await pool.query(`
      INSERT INTO iam.permission (code, name, description)
      VALUES
        ('REPORTING.VIEW', 'View operational reports', 'View warehouse-scoped dashboards and operational reports'),
        ('REPORTING.VIEW_COST', 'View inventory cost', 'View cost ledger and inventory valuation')
      ON CONFLICT (code) DO NOTHING;
    `);

    // 2. Assign permissions to all roles in iam.role
    await pool.query(`
      INSERT INTO iam.role_permission (role_id, permission_id)
      SELECT r.id, p.id
      FROM iam.role r
      CROSS JOIN iam.permission p
      WHERE p.code IN ('REPORTING.VIEW', 'REPORTING.VIEW_COST')
      ON CONFLICT (role_id, permission_id) DO NOTHING;
    `);

    // 3. Ensure actor 7075c245-a4cc-4ffe-883a-aac45011af3b has warehouse scope grant
    const warehouseRes = await pool.query(`SELECT id FROM warehouse.warehouse LIMIT 1`);
    const warehouseId = warehouseRes.rows[0]?.id || '7075c245-a4cc-4ffe-883a-aac45011af3b';

    await pool.query(`
      INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, granted_by)
      VALUES ('7075c245-a4cc-4ffe-883a-aac45011af3b', $1, '7075c245-a4cc-4ffe-883a-aac45011af3b')
      ON CONFLICT DO NOTHING;
    `, [warehouseId]);

    console.log('Successfully granted REPORTING.VIEW & REPORTING.VIEW_COST permissions to roles!');
  } catch (err) {
    console.error('Error granting reporting permissions:', err);
  } finally {
    await pool.end();
  }
}

main();
