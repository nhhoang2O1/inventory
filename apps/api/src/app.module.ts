import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/public/health.module.js';
import { IamModule } from './modules/iam/public/iam.module.js';
import { ApprovalModule } from './modules/approval/public/approval.module.js';
import { InventoryModule } from './modules/inventory/public/inventory.module.js';
import { PurchasingModule } from './modules/purchasing/public/purchasing.module.js';
import { ReceivingModule } from './modules/receiving/public/receiving.module.js';
import { OutboundModule } from './modules/outbound/public/outbound.module.js';
import { TransferModule } from './modules/transfer/public/transfer.module.js';
import { StocktakeModule } from './modules/stocktake/public/stocktake.module.js';
import { AdjustmentModule } from './modules/adjustment/public/adjustment.module.js';
import { QualityModule } from './modules/quality/public/quality.module.js';
import { RecallModule } from './modules/recall/public/recall.module.js';
import { PlanningModule } from './modules/planning/public/planning.module.js';
import { ReportingModule } from './modules/reporting/public/reporting.module.js';
import { IntegrationModule } from './modules/integration/public/integration.module.js';

@Module({
  imports: [
    HealthModule,
    IamModule,
    ApprovalModule,
    InventoryModule,
    PurchasingModule,
    ReceivingModule,
    OutboundModule,
    TransferModule,
    StocktakeModule,
    AdjustmentModule,
    QualityModule,
    RecallModule,
    PlanningModule,
    ReportingModule,
    IntegrationModule
  ]
})
export class AppModule {}
