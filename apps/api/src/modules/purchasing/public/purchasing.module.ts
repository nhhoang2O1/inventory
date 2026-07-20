import { Module } from '@nestjs/common';
import { PurchasingDatabaseService } from './purchasing-database.service.js';
import { SupplierService } from './supplier.service.js';
import { SupplierController } from './supplier.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { PurchaseOrderController } from './purchase-order.controller.js';
import { ApprovalModule } from '../../approval/public/approval.module.js';
import { PurchaseRequestService } from './purchase-request.service.js';
import { PurchaseRequestController } from './purchase-request.controller.js';
import { BusinessCalendarService } from './business-calendar.service.js';
import { BusinessCalendarController } from './business-calendar.controller.js';

@Module({
  imports: [ApprovalModule],
  controllers: [SupplierController, PurchaseOrderController, PurchaseRequestController, BusinessCalendarController],
  providers: [
    PurchasingDatabaseService,
    SupplierService,
    PurchaseOrderService,
    PurchaseRequestService,
    BusinessCalendarService
  ],
  exports: [SupplierService, PurchaseOrderService, PurchaseRequestService]
})
export class PurchasingModule {}
