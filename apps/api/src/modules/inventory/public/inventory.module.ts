import { Module } from '@nestjs/common';
import { InventoryCoreService } from './inventory-core.service.js';
import { InventoryApplicationService } from './inventory-application.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryDatabaseService } from './inventory-database.service.js';
import { WarehouseLayoutService } from './warehouse-layout.service.js';
import { WarehouseLayoutController } from './warehouse-layout.controller.js';

@Module({
  controllers: [InventoryController, WarehouseLayoutController],
  providers: [InventoryCoreService, InventoryApplicationService, InventoryDatabaseService, WarehouseLayoutService],
  exports: [InventoryCoreService, InventoryApplicationService, WarehouseLayoutService]
})
export class InventoryModule {}

