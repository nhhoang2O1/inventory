import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/public/health.module.js';
import { IamModule } from './modules/iam/public/iam.module.js';

@Module({
  imports: [HealthModule, IamModule]
})
export class AppModule {}
