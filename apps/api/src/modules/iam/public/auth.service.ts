import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import crypto from 'node:crypto';
import { IamDatabaseService } from './iam-database.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly db: IamDatabaseService) {}

  /**
   * Securely hash password using PBKDF2 (SHA-512)
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify password against stored hash
   */
  verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const salt = parts[0];
    const hash = parts[1];
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  }

  /**
   * Hash session token using SHA-256
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Register a new user
   */
  async register(username: string, displayName: string, email: string | null, roleCode: string, password: string) {
    const normalizedUsername = username.trim().toLowerCase();
    
    // Check if user already exists
    const existing = await this.db.query(
      'SELECT id FROM iam.app_user WHERE username = $1',
      [normalizedUsername]
    );
    if (existing.length > 0) {
      throw new BadRequestException('Tên đăng nhập đã tồn tại trên hệ thống.');
    }

    // Get role id from code
    const roles = await this.db.query<{ id: string }>(
      'SELECT id FROM iam.role WHERE code = $1 AND status = \'ACTIVE\'',
      [roleCode.toUpperCase()]
    );
    const role = roles[0];
    if (!role) {
      throw new BadRequestException(`Vai trò '${roleCode}' không hợp lệ hoặc đang bị khóa.`);
    }
    const roleId = role.id;

    // Hash password
    const hashedPassword = this.hashPassword(password);

    // Insert user
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO iam.app_user (username, display_name, email, role_id, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id`,
      [normalizedUsername, displayName, email, roleId, hashedPassword]
    );

    const inserted = result[0];
    if (!inserted) {
      throw new BadRequestException('Không thể lưu tài khoản vào cơ sở dữ liệu.');
    }

    return {
      userId: inserted.id,
      username: normalizedUsername,
      displayName,
      roleCode
    };
  }

  /**
   * Validate user credentials and return session details with session token
   */
  async login(username: string, password: string, correlationId: string = crypto.randomUUID()) {
    const normalizedUsername = username.trim().toLowerCase();

    // Check throttling for failed attempts in last 5 minutes
    try {
      const failedAttempts = await this.db.query<{ count: string }>(
        `SELECT count(*)::text as count FROM iam.auth_login_attempt
         WHERE username = $1 AND outcome IN ('FAILED', 'THROTTLED')
         AND occurred_at > now() - interval '5 minutes'`,
        [normalizedUsername]
      );
      if (Number(failedAttempts[0]?.count || 0) >= 10) {
        await this.db.query(
          `INSERT INTO iam.auth_login_attempt (username, outcome, correlation_id)
           VALUES ($1, 'THROTTLED', $2)`,
          [normalizedUsername, correlationId]
        ).catch(() => {});
        throw new UnauthorizedException('Tài khoản bị tạm khóa ngắn do thử đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.');
      }
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
    }

    // Query user and join with roles
    const users = await this.db.query<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string | null;
      status: string;
      role_code: string;
      role_name: string;
    }>(
      `SELECT u.id, u.username, u.display_name, u.password_hash, u.status, r.code as role_code, r.name as role_name
       FROM iam.app_user u
       JOIN iam.role r ON u.role_id = r.id
       WHERE u.username = $1`,
      [normalizedUsername]
    );

    const user = users[0];
    if (!user) {
      await this.db.query(
        `INSERT INTO iam.auth_login_attempt (username, outcome, correlation_id)
         VALUES ($1, 'FAILED', $2)`,
        [normalizedUsername, correlationId]
      ).catch(() => {});
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản này đang bị tạm khóa hoặc ngừng hoạt động.');
    }

    if (!user.password_hash) {
      throw new UnauthorizedException('Tài khoản này sử dụng phương thức đăng nhập khác.');
    }

    const isValid = this.verifyPassword(password, user.password_hash);
    if (!isValid) {
      await this.db.query(
        `INSERT INTO iam.auth_login_attempt (username, user_id, outcome, correlation_id)
         VALUES ($1, $2, 'FAILED', $3)`,
        [normalizedUsername, user.id, correlationId]
      ).catch(() => {});
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    // Log successful attempt
    await this.db.query(
      `INSERT INTO iam.auth_login_attempt (username, user_id, outcome, correlation_id)
       VALUES ($1, $2, 'SUCCEEDED', $3)`,
      [normalizedUsername, user.id, correlationId]
    ).catch(() => {});

    // Generate session token (opaque 32-byte hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes session

    // Save session in iam.auth_session
    await this.db.query(
      `INSERT INTO iam.auth_session (user_id, token_hash, correlation_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, tokenHash, correlationId, expiresAt.toISOString()]
    );

    // Get active warehouse scopes
    const scopes = await this.db.query<{ warehouse_id: string; warehouse_name: string; warehouse_code: string }>(
      `SELECT w.id as warehouse_id, w.name as warehouse_name, w.code as warehouse_code
       FROM iam.user_warehouse_scope s
       JOIN warehouse.warehouse w ON s.warehouse_id = w.id
       WHERE s.user_id = $1 AND s.revoked_at IS NULL AND (s.valid_until IS NULL OR s.valid_until > NOW())`,
      [user.id]
    );

    // Map database role code to frontend UserRole representation
    let userRole = 'Warehouse Staff';
    if (user.role_code === 'MANAGER') userRole = 'Manager';
    else if (user.role_code === 'ACCOUNTANT') userRole = 'Accountant';
    else if (user.role_code === 'SALES') userRole = 'Sales';

    return {
      sessionToken: rawToken,
      expiresAt: expiresAt.toISOString(),
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      userRole,
      warehouses: scopes.map(s => ({
        id: s.warehouse_id,
        name: s.warehouse_name,
        code: s.warehouse_code
      }))
    };
  }

  /**
   * Revoke session on logout
   */
  async logout(sessionToken: string) {
    if (!sessionToken) return { success: true };
    const tokenHash = this.hashToken(sessionToken);
    await this.db.query(
      `UPDATE iam.auth_session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    return { success: true };
  }

  /**
   * Validate session token
   */
  async validateSession(sessionToken: string) {
    if (!sessionToken) return null;
    const tokenHash = this.hashToken(sessionToken);
    const sessions = await this.db.query<{
      user_id: string;
      expires_at: string;
      username: string;
      display_name: string;
      role_code: string;
    }>(
      `SELECT s.user_id, s.expires_at, u.username, u.display_name, r.code as role_code
       FROM iam.auth_session s
       JOIN iam.app_user u ON s.user_id = u.id
       JOIN iam.role r ON u.role_id = r.id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [tokenHash]
    );
    return sessions[0] || null;
  }
}
