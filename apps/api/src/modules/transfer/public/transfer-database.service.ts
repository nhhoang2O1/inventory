import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg, { type PoolClient, type QueryResultRow } from 'pg';

const { Pool } = pg;

@Injectable()
export class TransferDatabaseService implements OnModuleDestroy {
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

  async hasAccess(actorId: string, permission: string, warehouseId: string, client?: PoolClient): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query<{ allowed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM iam.app_user u
        JOIN iam.role r ON r.id = u.role_id AND r.status = 'ACTIVE'
        JOIN iam.role_permission rp ON rp.role_id = r.id
        JOIN iam.permission p ON p.id = rp.permission_id AND p.status = 'ACTIVE' AND p.code = $2
        JOIN iam.user_warehouse_scope scope ON scope.user_id = u.id AND scope.warehouse_id = $3
          AND scope.revoked_at IS NULL AND scope.valid_from <= now()
          AND (scope.valid_until IS NULL OR scope.valid_until > now())
        WHERE u.id = $1 AND u.status = 'ACTIVE'
      ) AS allowed`, [actorId, permission, warehouseId]);
    return result.rows[0]?.allowed ?? false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
