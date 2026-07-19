import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { IntegrationService, type CreateIntegrationEndpointInput } from './integration.service.js';

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

@Controller('integrations')
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  @Post('endpoints')
  createEndpoint(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateIntegrationEndpointInput
  ) {
    if (!Array.isArray(body.eventTypes)) throw new BadRequestException('eventTypes must be an array');
    return this.service.createEndpoint(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('endpoints')
  listEndpoints(@Headers('x-actor-id') actor: string | undefined) {
    return this.service.listEndpoints(requiredUuid(actor, 'actorId'));
  }

  @Get('reconciliation')
  reconciliation(@Headers('x-actor-id') actor: string | undefined) {
    return this.service.reconciliation(requiredUuid(actor, 'actorId'));
  }

  @Get('dead-letter')
  deadLetters(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('limit') limit: string | undefined
  ) {
    const parsed = limit === undefined ? 100 : Number(limit);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException('limit must be a positive integer');
    return this.service.listDeadLetters(requiredUuid(actor, 'actorId'), parsed);
  }

  @Get('events/:id')
  getEvent(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.getEvent(requiredUuid(actor, 'actorId'), requiredUuid(id, 'eventId'));
  }

  @Post('events/:id/replay')
  replay(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { reason?: string }
  ) {
    return this.service.replay(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'eventId'), body.reason ?? '',
      requiredUuid(request.correlationId, 'correlationId')
    );
  }
}
