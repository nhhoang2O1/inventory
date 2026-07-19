import { Module } from '@nestjs/common';
import { TransferController } from './transfer.controller.js';
import { TransferDatabaseService } from './transfer-database.service.js';
import { TransferService } from './transfer.service.js';

@Module({
  controllers: [TransferController],
  providers: [TransferDatabaseService, TransferService],
  exports: [TransferService]
})
export class TransferModule {}
