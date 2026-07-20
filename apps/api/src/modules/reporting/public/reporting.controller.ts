import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { ReportingService } from './reporting.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requiredUuid(value: string | undefined, name: string): string {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}
function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new BadRequestException(`${name} is required`);
  return value.trim();
}

@Controller('reports')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('dashboard')
  dashboard(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('businessDate') businessDate: string | undefined,
    @Req() request: { correlationId?: string }
  ) {
    return this.service.dashboard(
      requiredUuid(actor, 'actorId'), requiredUuid(warehouseId, 'warehouseId'),
      required(businessDate, 'businessDate'), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('inventory-activity')
  inventoryActivity(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('skuId') skuId: string | undefined,
    @Req() request: { correlationId?: string }
  ) {
    if (skuId) requiredUuid(skuId, 'skuId');
    return this.service.inventoryActivity(
      requiredUuid(actor, 'actorId'), requiredUuid(warehouseId, 'warehouseId'),
      required(from, 'from'), required(to, 'to'), requiredUuid(request.correlationId, 'correlationId'), skuId
    );
  }

  @Get('quality-recall')
  qualityRecall(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() request: { correlationId?: string }
  ) {
    return this.service.qualityRecall(
      requiredUuid(actor, 'actorId'), requiredUuid(warehouseId, 'warehouseId'),
      required(from, 'from'), required(to, 'to'), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('inventory-value')
  inventoryValue(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('skuId') skuId: string | undefined,
    @Req() request: { correlationId?: string }
  ) {
    if (skuId) requiredUuid(skuId, 'skuId');
    return this.service.inventoryValue(
      requiredUuid(actor, 'actorId'), requiredUuid(warehouseId, 'warehouseId'),
      requiredUuid(request.correlationId, 'correlationId'), skuId
    );
  }

  @Get('supplier-kpi')
  supplierKpi(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('timezone') timezone: string | undefined,
    @Req() request: { correlationId?: string }
  ) {
    return this.service.supplierKpi(
      requiredUuid(actor, 'actorId'), requiredUuid(supplierId, 'supplierId'),
      required(from, 'from'), required(to, 'to'), required(timezone, 'timezone'),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('runs/:id/export')
  createExport(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() _body: Record<string, never>
  ) {
    return this.service.createExport(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'reportRunId'),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('exports/:id')
  getExport(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.getExport(requiredUuid(actor, 'actorId'), requiredUuid(id, 'exportId'));
  }
}
