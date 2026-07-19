import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import {
  TransferService,
  type CreateTransferInput,
  type ReceiveTransferLineInput
} from './transfer.service.js';

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
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new BadRequestException('expectedVersion must be a positive integer');
  return Number(value);
}

function positiveQuantity(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new BadRequestException(`${name} must be a positive whole case quantity`);
  return Number(value);
}

function optionalQuantity(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new BadRequestException(`${name} must be a non-negative whole case quantity`);
  return Number(value);
}

@Controller('transfers')
export class TransferController {
  constructor(private readonly service: TransferService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateTransferInput
  ) {
    requiredUuid(body.sourceWarehouseId, 'sourceWarehouseId');
    requiredUuid(body.destinationWarehouseId, 'destinationWarehouseId');
    if (body.transitWarehouseId) requiredUuid(body.transitWarehouseId, 'transitWarehouseId');
    if (body.transitLocationId) requiredUuid(body.transitLocationId, 'transitLocationId');
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new BadRequestException('lines are required');
    for (const line of body.lines) {
      requiredUuid(line.skuId, 'skuId');
      requiredUuid(line.batchId, 'batchId');
      requiredUuid(line.sourceLocationId, 'sourceLocationId');
      requiredUuid(line.destinationLocationId, 'destinationLocationId');
      positiveQuantity(line.quantity, 'quantity');
    }
    return this.service.createTransfer(
      requiredUuid(actor, 'actorId'), body, requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get(':id')
  findOne(@Headers('x-actor-id') actor: string | undefined, @Param('id') id: string) {
    return this.service.findTransfer(requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'));
  }

  @Post(':id/approve')
  approve(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    requiredKey(idempotencyKey);
    return this.service.approveTransfer(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/start-picking')
  startPicking(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    requiredKey(idempotencyKey);
    return this.service.startPicking(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/lines/:lineId/pick')
  confirmPick(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Req() request: { correlationId?: string },
    @Body() body: { quantity?: number; expectedVersion?: number }
  ) {
    requiredKey(idempotencyKey);
    return this.service.confirmPick(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), requiredUuid(lineId, 'transferLineId'),
      positiveQuantity(body.quantity, 'quantity'), version(body.expectedVersion),
      requiredKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/dispatch')
  dispatch(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.dispatchTransfer(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), version(body.expectedVersion),
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId'), body.reason
    );
  }

  @Post(':id/receipts')
  receive(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { receiptCode?: string; expectedVersion?: number; lines?: ReceiveTransferLineInput[] }
  ) {
    if (!body.receiptCode?.trim() || !Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('receiptCode and lines are required');
    }
    for (const line of body.lines) {
      requiredUuid(line.transferLineId, 'transferLineId');
      requiredUuid(line.destinationLocationId, 'destinationLocationId');
      if (line.damagedLocationId) requiredUuid(line.damagedLocationId, 'damagedLocationId');
      optionalQuantity(line.receivedQuantity, 'receivedQuantity');
      optionalQuantity(line.damagedQuantity, 'damagedQuantity');
      optionalQuantity(line.missingQuantity, 'missingQuantity');
    }
    return this.service.receiveTransfer(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), body.receiptCode, body.lines,
      version(body.expectedVersion), requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('discrepancies/:discrepancyId/resolve')
  resolveDiscrepancy(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('discrepancyId') discrepancyId: string,
    @Req() request: { correlationId?: string },
    @Body() body: { resolution?: string }
  ) {
    if (!body.resolution?.trim()) throw new BadRequestException('resolution is required');
    return this.service.resolveDiscrepancy(
      requiredUuid(actor, 'actorId'), requiredUuid(discrepancyId, 'discrepancyId'), body.resolution,
      requiredKey(idempotencyKey), requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/close')
  close(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    requiredKey(idempotencyKey);
    return this.service.closeTransfer(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post(':id/cancel')
  cancel(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    requiredKey(idempotencyKey);
    if (!body.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.cancelTransfer(
      requiredUuid(actor, 'actorId'), requiredUuid(id, 'transferId'), version(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId'), body.reason
    );
  }
}
