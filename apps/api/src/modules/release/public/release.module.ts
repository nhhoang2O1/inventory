import { Module } from '@nestjs/common';
import { ReleaseController } from './release.controller.js';
import { ReleaseDatabaseService } from './release-database.service.js';
import { ReleaseService } from './release.service.js';
@Module({controllers:[ReleaseController],providers:[ReleaseDatabaseService,ReleaseService],exports:[ReleaseService]})
export class ReleaseModule{}
