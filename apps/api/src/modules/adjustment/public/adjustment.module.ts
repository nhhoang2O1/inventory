import { Module } from '@nestjs/common';
import { AdjustmentDatabaseService } from './adjustment-database.service.js';
import { ReversalController } from './reversal.controller.js';
import { ReversalService } from './reversal.service.js';

@Module({
  controllers: [ReversalController],
  providers: [AdjustmentDatabaseService, ReversalService],
  exports: [ReversalService]
})
export class AdjustmentModule {}
