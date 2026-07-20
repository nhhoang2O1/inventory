import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { StocktakeService, type CreateStocktakeInput } from './stocktake.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value: string | undefined, name: string): string {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

function requiredKey(value: string | undefined): string {
  if (!value || value.length < 16 || value.length > 128) {
    throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');
  }
  return value;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new BadRequestException('expectedVersion must be a positive integer');
  }
  return Number(value);
}

function nonNegativeQuantity(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new BadRequestException('countedQuantity must be a non-negative whole case quantity');
  }
  return Number(value);
}

@Controller('stocktakes')
export class StocktakeController {
  constructor(private readonly service: StocktakeService) {}

  @Get()
  list(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined
  ) {
    return this.service.listSessions(requiredUuid(actor, 'actorId'), requiredUuid(warehouseId, 'warehouseId'));
  }

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateStocktakeInput
  ) {
    requiredUuid(body.warehouseId, 'warehouseId');
    if (body.zoneId) requiredUuid(body.zoneId, 'zoneId');
    if (body.locationId) requiredUuid(body.locationId, 'locationId');
    if (body.skuId) requiredUuid(body.skuId, 'skuId');
    if (body.recountThreshold !== undefined) nonNegativeQuantity(body.recountThreshold);
    return this.service.createSession(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get(':id')
  findOne(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.findSession(requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'));
  }

  @Post(':id/start')
  start(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.startSession(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/counts')
  count(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { snapshotLineId?: string; countedQuantity?: number; evidenceReference?: string; expectedVersion?: number }
  ) {
    return this.service.recordCount(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'),
      requiredUuid(body.snapshotLineId, 'snapshotLineId'), nonNegativeQuantity(body.countedQuantity),
      body.evidenceReference, version(body.expectedVersion), requiredKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/complete-round')
  completeRound(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.completeRound(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/request-approval')
  requestApproval(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.requestApproval(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/approve')
  approve(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.approveSession(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'), version(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/post-adjustment')
  postAdjustment(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.postAdjustment(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'), version(body.expectedVersion),
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/cancel')
  cancel(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.cancelSession(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'stocktakeSessionId'), version(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }
}
