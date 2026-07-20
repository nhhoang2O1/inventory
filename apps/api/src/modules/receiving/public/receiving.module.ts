import { Module } from '@nestjs/common';
import { ReceivingDatabaseService } from './receiving-database.service.js';
import { GoodsReceiptService } from './goods-receipt.service.js';
import { GoodsReceiptController } from './goods-receipt.controller.js';
import { ApprovalModule } from '../../approval/public/approval.module.js';
import { ReceiptExceptionService } from './receipt-exception.service.js';
import { ReceiptExceptionController } from './receipt-exception.controller.js';

@Module({
  imports: [ApprovalModule],
  controllers: [GoodsReceiptController, ReceiptExceptionController],
  providers: [
    ReceivingDatabaseService,
    GoodsReceiptService,
    ReceiptExceptionService
  ],
  exports: [GoodsReceiptService, ReceiptExceptionService]
})
export class ReceivingModule {}
