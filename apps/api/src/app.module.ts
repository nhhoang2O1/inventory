import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/public/health.module.js';
import { IamModule } from './modules/iam/public/iam.module.js';
import { ApprovalModule } from './modules/approval/public/approval.module.js';

@Module({
  imports: [HealthModule, IamModule, ApprovalModule]
})
export class AppModule {}
