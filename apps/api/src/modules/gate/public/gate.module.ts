import { Module } from '@nestjs/common';
import { GateController } from './gate.controller.js';
import { GateDatabaseService } from './gate-database.service.js';
import { GateService } from './gate.service.js';

@Module({
  controllers: [GateController],
  providers: [GateDatabaseService, GateService],
  exports: [GateService]
})
export class GateModule {}
