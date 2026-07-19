import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { QualityService, type CreateDispositionInput, type CreateQualityCaseInput } from './quality.service.js';

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

function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new BadRequestException('expectedVersion must be a positive integer');
  return Number(value);
}

function positiveQuantity(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new BadRequestException('quantity must be a positive whole case quantity');
  return Number(value);
}

@Controller('quality')
export class QualityController {
  constructor(private readonly service: QualityService) {}

  @Post('cases')
  createCase(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateQualityCaseInput
  ) {
    requiredUuid(body.warehouseId, 'warehouseId');
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new BadRequestException('lines are required');
    for (const line of body.lines) {
      requiredUuid(line.balanceId, 'balanceId');
      requiredUuid(line.holdLocationId, 'holdLocationId');
      positiveQuantity(line.quantity);
    }
    return this.service.createCase(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('cases/:id')
  findCase(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.findCase(requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityCaseId'));
  }

  @Post('cases/:id/contain')
  containCase(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.containCase(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityCaseId'), expectedVersion(body.expectedVersion),
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('cases/:id/dispositions')
  requestDisposition(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: CreateDispositionInput & { expectedVersion?: number }
  ) {
    if (body.destinations) {
      for (const destination of body.destinations) {
        requiredUuid(destination.qualityCaseLineId, 'qualityCaseLineId');
        requiredUuid(destination.destinationLocationId, 'destinationLocationId');
      }
    }
    return this.service.requestDisposition(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityCaseId'), body,
      expectedVersion(body.expectedVersion), requiredKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('dispositions/:id/approve')
  approveDisposition(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.approveDisposition(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityDispositionId'), expectedVersion(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('dispositions/:id/reject')
  rejectDisposition(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.rejectDisposition(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityDispositionId'), expectedVersion(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('dispositions/:id/post')
  postDisposition(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.postDisposition(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityDispositionId'), expectedVersion(body.expectedVersion),
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('expiry-runs')
  runExpiry(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: { warehouseId?: string; expiredLocationId?: string; businessDate?: string }
  ) {
    if (!body.businessDate) throw new BadRequestException('businessDate is required');
    return this.service.runExpiry(
      requiredUuid(actor, 'actorId'), requiredUuid(body.warehouseId, 'warehouseId'),
      requiredUuid(body.expiredLocationId, 'expiredLocationId'), body.businessDate,
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('cases/:id/cancel')
  cancelCase(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.cancelCase(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'qualityCaseId'), expectedVersion(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }
}
