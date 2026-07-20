import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller.js';
import { IntegrationDatabaseService } from './integration-database.service.js';
import { IntegrationService } from './integration.service.js';

@Module({ controllers: [IntegrationController], providers: [IntegrationDatabaseService, IntegrationService] })
export class IntegrationModule {}
