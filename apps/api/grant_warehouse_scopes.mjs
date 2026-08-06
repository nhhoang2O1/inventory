import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/wms_db'
});

async function main() {
  try {
    // 1. Grant warehouse scopes to all users for all warehouses
    await pool.query(`
      INSERT INTO iam.user_warehouse_scope (user_id, warehouse_id, valid_from, granted_by)
      SELECT u.id, w.id, now() - interval '1 day', u.id
      FROM iam.app_user u
      CROSS JOIN warehouse.warehouse w
      ON CONFLICT DO NOTHING;
    `);

    // 2. Grant all permissions to all roles
    await pool.query(`
      INSERT INTO iam.role_permission (role_id, permission_id)
      SELECT r.id, p.id
      FROM iam.role r
      CROSS JOIN iam.permission p
      ON CONFLICT DO NOTHING;
    `);

    console.log('Successfully updated warehouse scope grants and role permissions!');
  } catch (err) {
    console.error('Error updating scope grants:', err);
  } finally {
    await pool.end();
  }
}

main();
