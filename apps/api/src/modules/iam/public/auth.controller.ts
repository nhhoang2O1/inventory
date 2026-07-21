import { Controller, Post, Body, HttpCode, HttpStatus, Headers, Req } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('iam/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: any
  ) {
    return await this.authService.register(
      body.username,
      body.displayName,
      body.email,
      body.roleCode,
      body.password
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: any,
    @Req() req: any
  ) {
    return await this.authService.login(
      body.username,
      body.password,
      req.correlationId
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Headers('authorization') authHeader?: string,
    @Headers('x-session-token') sessionTokenHeader?: string
  ) {
    const token = sessionTokenHeader || (authHeader ? authHeader.replace('Bearer ', '') : '');
    return await this.authService.logout(token);
  }
}
