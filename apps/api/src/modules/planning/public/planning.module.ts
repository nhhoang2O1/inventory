import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller.js';
import { PlanningDatabaseService } from './planning-database.service.js';
import { PlanningService } from './planning.service.js';

@Module({ controllers: [PlanningController], providers: [PlanningDatabaseService, PlanningService] })
export class PlanningModule {}
