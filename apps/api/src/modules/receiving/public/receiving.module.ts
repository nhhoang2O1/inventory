import { Module } from '@nestjs/common';
import { ReceivingDatabaseService } from './receiving-database.service.js';
import { GoodsReceiptService } from './goods-receipt.service.js';
import { GoodsReceiptController } from './goods-receipt.controller.js';

@Module({
  controllers: [GoodsReceiptController],
  providers: [
    ReceivingDatabaseService,
    GoodsReceiptService
  ],
  exports: [GoodsReceiptService]
})
export class ReceivingModule {}
