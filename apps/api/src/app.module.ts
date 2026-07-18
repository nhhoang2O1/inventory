import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/public/health.module.js';
import { IamModule } from './modules/iam/public/iam.module.js';
import { ApprovalModule } from './modules/approval/public/approval.module.js';
import { InventoryModule } from './modules/inventory/public/inventory.module.js';
import { PurchasingModule } from './modules/purchasing/public/purchasing.module.js';
import { ReceivingModule } from './modules/receiving/public/receiving.module.js';

@Module({
  imports: [HealthModule, IamModule, ApprovalModule, InventoryModule, PurchasingModule, ReceivingModule]
})
export class AppModule {}
