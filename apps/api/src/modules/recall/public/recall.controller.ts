import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { RecallService, type CreateRecallInput } from './recall.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value: string | undefined, name: string): string {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

function requiredKey(value: string | undefined): string {
  if (!value || value.length < 16 || value.length > 128) throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');
  return value;
}

function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new BadRequestException('expectedVersion must be a positive integer');
  return Number(value);
}

@Controller('recalls')
export class RecallController {
  constructor(private readonly service: RecallService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateRecallInput
  ) {
    requiredUuid(body.skuId, 'skuId');
    requiredUuid(body.batchId, 'batchId');
    if (!Array.isArray(body.scopes) || body.scopes.length === 0) throw new BadRequestException('scopes are required');
    for (const scope of body.scopes) {
      requiredUuid(scope.warehouseId, 'warehouseId');
      requiredUuid(scope.recallLocationId, 'recallLocationId');
    }
    return this.service.create(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get(':id')
  findOne(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.findOne(requiredUuid(actor, 'actorId'), requiredUuid(id, 'recallCaseId'));
  }

  @Post(':id/approve')
  approve(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.approve(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'recallCaseId'), expectedVersion(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/contain')
  contain(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.contain(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'recallCaseId'), expectedVersion(body.expectedVersion),
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/close')
  close(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.close(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'recallCaseId'), expectedVersion(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/cancel')
  cancel(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.cancel(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'recallCaseId'), expectedVersion(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }
}
