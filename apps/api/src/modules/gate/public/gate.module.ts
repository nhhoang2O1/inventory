import { Module } from '@nestjs/common';
import { GateController } from './gate.controller.js';
import { GateDatabaseService } from './gate-database.service.js';
import { GateService } from './gate.service.js';
import { PoPdfReportService } from './po-pdf-report.service.js';

@Module({
  controllers: [GateController],
  providers: [GateDatabaseService, GateService, PoPdfReportService],
  exports: [GateService, PoPdfReportService]
})
export class GateModule {}
