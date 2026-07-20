import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { sharedDatabasePool } from '../../../shared/database-pool.js';


@Injectable()
export class InventoryDatabaseService implements OnModuleDestroy {
  private readonly pool = sharedDatabasePool;

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
    const rows = await this.query<{ allowed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM iam.app_user u
        JOIN iam.role r ON r.id=u.role_id AND r.status='ACTIVE'
        JOIN iam.role_permission rp ON rp.role_id=r.id
        JOIN iam.permission p ON p.id=rp.permission_id AND p.status='ACTIVE' AND p.code=$2
        JOIN iam.user_warehouse_scope s ON s.user_id=u.id AND s.warehouse_id=$3
          AND s.revoked_at IS NULL AND s.valid_from<=now() AND (s.valid_until IS NULL OR s.valid_until>now())
        WHERE u.id=$1 AND u.status='ACTIVE'
      ) AS allowed`, [actorId, permissionCode, warehouseId]);
    return rows[0]?.allowed ?? false;
  }

  async hasPermission(actorId:string,permissionCode:string):Promise<boolean>{
    const rows=await this.query<{allowed:boolean}>(`SELECT EXISTS(
      SELECT 1 FROM iam.app_user user_account
      JOIN iam.role role ON role.id=user_account.role_id AND role.status='ACTIVE'
      JOIN iam.role_permission grant_record ON grant_record.role_id=role.id
      JOIN iam.permission permission ON permission.id=grant_record.permission_id
        AND permission.status='ACTIVE' AND permission.code=$2
      WHERE user_account.id=$1 AND user_account.status='ACTIVE'
    ) allowed`,[actorId,permissionCode]);
    return rows[0]?.allowed??false;
  }

  async onModuleDestroy(): Promise<void> { return; }
}
