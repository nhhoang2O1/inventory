import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const sessionHeader = request.headers['x-session-token'];
    const token = sessionHeader || (authHeader ? authHeader.replace('Bearer ', '') : '');

    // Allow development fallback if REQUIRE_SESSION_AUTH is not strictly enabled and X-Actor-Id is present
    if (!token && process.env.REQUIRE_SESSION_AUTH !== 'true' && request.headers['x-actor-id']) {
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    }

    const session = await this.authService.validateSession(token);
    if (!session) {
      throw new UnauthorizedException('Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    }

    request.user = session;
    request.headers['x-actor-id'] = session.user_id;
    return true;
  }
}
