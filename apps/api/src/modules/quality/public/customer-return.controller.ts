import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { CustomerReturnService, type CreateCustomerReturnInput } from './customer-return.service.js';

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

@Controller('returns')
export class CustomerReturnController {
  constructor(private readonly service: CustomerReturnService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateCustomerReturnInput
  ) {
    requiredUuid(body.warehouseId, 'warehouseId');
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new BadRequestException('lines are required');
    for (const line of body.lines) {
      requiredUuid(line.skuId, 'skuId');
      requiredUuid(line.batchId, 'batchId');
      requiredUuid(line.quarantineLocationId, 'quarantineLocationId');
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new BadRequestException('quantity must be a positive whole case quantity');
    }
    return this.service.create(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get(':id')
  findOne(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.findOne(requiredUuid(actor, 'actorId'), requiredUuid(id, 'customerReturnId'));
  }

  @Post(':id/approve')
  approve(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    return this.service.approve(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'customerReturnId'), expectedVersion(body.expectedVersion),
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
    return this.service.post(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'customerReturnId'), expectedVersion(body.expectedVersion),
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
    return this.service.cancel(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'customerReturnId'), expectedVersion(body.expectedVersion),
      body.reason ?? '', requiredUuid(request.correlationId, 'correlationId')
    );
  }
}
