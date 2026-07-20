import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller.js';
import { ReportingDatabaseService } from './reporting-database.service.js';
import { ReportingService } from './reporting.service.js';

@Module({ controllers: [ReportingController], providers: [ReportingDatabaseService, ReportingService] })
export class ReportingModule {}
