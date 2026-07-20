import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg, { type PoolClient, type QueryResultRow } from 'pg';

const { Pool } = pg;

@Injectable()
export class ReportingDatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async query<T extends QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    return (await this.pool.query<T>(sql, [...values])).rows;
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async hasAccess(actorId: string, permissionCode: string, warehouseId: string): Promise<boolean> {
    const result = await this.pool.query<{ allowed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM iam.app_user user_account
        JOIN iam.role role ON role.id = user_account.role_id AND role.status = 'ACTIVE'
        JOIN iam.role_permission grant_record ON grant_record.role_id = role.id
        JOIN iam.permission permission ON permission.id = grant_record.permission_id
          AND permission.status = 'ACTIVE' AND permission.code = $2
        JOIN iam.user_warehouse_scope scope ON scope.user_id = user_account.id AND scope.warehouse_id = $3
          AND scope.revoked_at IS NULL AND scope.valid_from <= now()
          AND (scope.valid_until IS NULL OR scope.valid_until > now())
        WHERE user_account.id = $1 AND user_account.status = 'ACTIVE'
      ) AS allowed`, [actorId, permissionCode, warehouseId]);
    return result.rows[0]?.allowed ?? false;
  }

  async hasPermission(actorId: string, permissionCode: string): Promise<boolean> {
    const result = await this.pool.query<{ allowed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM iam.app_user user_account
        JOIN iam.role role ON role.id = user_account.role_id AND role.status = 'ACTIVE'
        JOIN iam.role_permission grant_record ON grant_record.role_id = role.id
        JOIN iam.permission permission ON permission.id = grant_record.permission_id
          AND permission.status = 'ACTIVE' AND permission.code = $2
        WHERE user_account.id = $1 AND user_account.status = 'ACTIVE'
      ) AS allowed`, [actorId, permissionCode]);
    return result.rows[0]?.allowed ?? false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
