import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/public/health.module.js';
import { IamModule } from './modules/iam/public/iam.module.js';
import { ApprovalModule } from './modules/approval/public/approval.module.js';
import { InventoryModule } from './modules/inventory/public/inventory.module.js';

@Module({
  imports: [HealthModule, IamModule, ApprovalModule, InventoryModule]
})
export class AppModule {}
