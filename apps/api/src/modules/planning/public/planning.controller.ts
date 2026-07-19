import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { PlanningService, type CreateReorderPolicyInput } from './planning.service.js';

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

@Controller('planning')
export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  @Post('policies')
  createPolicy(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateReorderPolicyInput
  ) {
    requiredUuid(body.warehouseId, 'warehouseId');
    requiredUuid(body.skuId, 'skuId');
    requiredUuid(body.supplierId, 'supplierId');
    return this.service.createPolicy(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('policies')
  listPolicies(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('businessDate') businessDate?: string
  ) {
    return this.service.listPolicies(
      requiredUuid(actor, 'actorId'), requiredUuid(warehouseId, 'warehouseId'), businessDate
    );
  }

  @Post('policies/:id/deactivate')
  deactivatePolicy(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { reason?: string }
  ) {
    return this.service.deactivatePolicy(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'policyId'), body.reason ?? '',
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('runs')
  run(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: { warehouseId?: string; businessDate?: string }
  ) {
    if (!body.businessDate) throw new BadRequestException('businessDate is required');
    return this.service.run(
      requiredUuid(actor, 'actorId'), requiredUuid(body.warehouseId, 'warehouseId'), body.businessDate,
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('runs/:id')
  getRun(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.getRun(requiredUuid(actor, 'actorId'), requiredUuid(id, 'runId'));
  }
}
