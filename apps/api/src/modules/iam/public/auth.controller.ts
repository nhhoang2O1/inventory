import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
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
    @Body() body: any
  ) {
    return await this.authService.login(
      body.username,
      body.password
    );
  }
}
