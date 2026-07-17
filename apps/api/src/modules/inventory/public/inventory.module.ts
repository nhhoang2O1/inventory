import { Module } from '@nestjs/common';
import { InventoryCoreService } from './inventory-core.service.js';
import { InventoryApplicationService } from './inventory-application.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryDatabaseService } from './inventory-database.service.js';
@Module({
  controllers: [InventoryController],
  providers: [InventoryCoreService, InventoryApplicationService, InventoryDatabaseService],
  exports: [InventoryCoreService, InventoryApplicationService]
})
export class InventoryModule {}
