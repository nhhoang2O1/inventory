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
    return hash === verifyHash;
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
   * Validate user credentials and return session details
   */
  async login(username: string, password: string) {
    const normalizedUsername = username.trim().toLowerCase();

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
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

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
}
