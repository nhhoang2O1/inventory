import { Module } from '@nestjs/common';
import { RecallController } from './recall.controller.js';
import { RecallDatabaseService } from './recall-database.service.js';
import { RecallService } from './recall.service.js';

@Module({
  controllers: [RecallController],
  providers: [RecallDatabaseService, RecallService],
  exports: [RecallService]
})
export class RecallModule {}
