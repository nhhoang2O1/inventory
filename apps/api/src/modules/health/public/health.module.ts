import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ReleaseModule } from '../../release/public/release.module.js';

@Module({ imports:[ReleaseModule],controllers: [HealthController] })
export class HealthModule {}
