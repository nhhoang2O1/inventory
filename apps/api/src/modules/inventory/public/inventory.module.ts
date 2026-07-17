import { Module } from '@nestjs/common';
import { InventoryCoreService } from './inventory-core.service.js';
@Module({ providers: [InventoryCoreService], exports: [InventoryCoreService] })
export class InventoryModule {}
