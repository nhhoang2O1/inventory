import { Module } from '@nestjs/common';
import { PurchasingDatabaseService } from './purchasing-database.service.js';
import { SupplierService } from './supplier.service.js';
import { SupplierController } from './supplier.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { PurchaseOrderController } from './purchase-order.controller.js';

@Module({
  controllers: [SupplierController, PurchaseOrderController],
  providers: [
    PurchasingDatabaseService,
    SupplierService,
    PurchaseOrderService
  ],
  exports: [SupplierService, PurchaseOrderService]
})
export class PurchasingModule {}
