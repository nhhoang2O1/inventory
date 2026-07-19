import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { ReversalService, type CreateReversalInput } from './reversal.service.js';

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

@Controller('reversals')
export class ReversalController {
  constructor(private readonly service: ReversalService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateReversalInput
  ) {
    requiredUuid(body.originalDocumentId, 'originalDocumentId');
    if (!Array.isArray(body.movementIds) || body.movementIds.length === 0) {
      throw new BadRequestException('movementIds are required');
    }
    for (const id of body.movementIds) requiredUuid(id, 'movementId');
    return this.service.createRequest(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get(':id')
  findOne(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.findRequest(requiredUuid(actor, 'actorId'), requiredUuid(id, 'reversalRequestId'));
  }

  @Post(':id/submit')
  submit(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.submitRequest(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'reversalRequestId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/approve')
  approve(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.approveRequest(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'reversalRequestId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/post')
  post(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.postRequest(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'reversalRequestId'), version(body.expectedVersion),
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
    return this.service.cancelRequest(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'reversalRequestId'), version(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }
}
