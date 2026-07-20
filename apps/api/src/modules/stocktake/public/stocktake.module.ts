import { Module } from '@nestjs/common';
import { StocktakeController } from './stocktake.controller.js';
import { StocktakeDatabaseService } from './stocktake-database.service.js';
import { StocktakeService } from './stocktake.service.js';

@Module({
  controllers: [StocktakeController],
  providers: [StocktakeDatabaseService, StocktakeService],
  exports: [StocktakeService]
})
export class StocktakeModule {}
