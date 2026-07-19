import { Module } from '@nestjs/common';
import { CustomerReturnController } from './customer-return.controller.js';
import { CustomerReturnService } from './customer-return.service.js';
import { QualityController } from './quality.controller.js';
import { QualityDatabaseService } from './quality-database.service.js';
import { QualityService } from './quality.service.js';

@Module({
  controllers: [QualityController, CustomerReturnController],
  providers: [QualityDatabaseService, QualityService, CustomerReturnService],
  exports: [QualityService, CustomerReturnService]
})
export class QualityModule {}
