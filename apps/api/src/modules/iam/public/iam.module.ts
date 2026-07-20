import { Module } from '@nestjs/common';
import { AccessPolicyService } from './access-policy.service.js';
import { IamDatabaseService } from './iam-database.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthSessionGuard } from './auth-session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AccessPolicyService, IamDatabaseService, AuthService, AuthSessionGuard],
  exports: [AccessPolicyService, AuthService, AuthSessionGuard]
})
export class IamModule {}
