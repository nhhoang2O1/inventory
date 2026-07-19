import { Module } from '@nestjs/common';
import { OutboundController } from './outbound.controller.js';
import { OutboundDatabaseService } from './outbound-database.service.js';
import { OutboundService } from './outbound.service.js';

@Module({
  controllers: [OutboundController],
  providers: [OutboundDatabaseService, OutboundService],
  exports: [OutboundService]
})
export class OutboundModule {}
