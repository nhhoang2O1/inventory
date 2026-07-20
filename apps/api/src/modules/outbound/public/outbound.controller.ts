import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req
} from '@nestjs/common';
import {
  OutboundService,
  type AllocateIssueRequestInput,
  type CreateIssueRequestInput
} from './outbound.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const issueStatuses = new Set(['DRAFT', 'SUBMITTED', 'APPROVED', 'ALLOCATED', 'PICKING', 'POSTED', 'CANCELLED']);

function requiredUuid(value: string | undefined, name: string): string {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

function requiredIdempotencyKey(value: string | undefined): string {
  if (!value || value.length < 16 || value.length > 128) {
    throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');
  }
  return value;
}

function positiveVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new BadRequestException('expectedVersion must be a positive integer');
  }
  return Number(value);
}

function wholeCase(value: unknown, name = 'quantity'): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new BadRequestException(`${name} must be a positive whole case quantity`);
  }
  return Number(value);
}

@Controller('outbound')
export class OutboundController {
  constructor(private readonly service: OutboundService) {}

  @Post('issue-requests')
  createIssueRequest(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: { correlationId?: string },
    @Body() body: CreateIssueRequestInput
  ) {
    const actorId = requiredUuid(actor, 'actorId');
    requiredUuid(body.warehouseId, 'warehouseId');
    if (body.customerReferenceId) requiredUuid(body.customerReferenceId, 'customerReferenceId');
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('lines are required');
    }
    for (const line of body.lines) {
      requiredUuid(line.skuId, 'skuId');
      wholeCase(line.quantity);
    }
    return this.service.createIssueRequest(
      actorId,
      body,
      requiredIdempotencyKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Get('issue-requests')
  listIssueRequests(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('status') status?: string,
    @Query('limit') limit?: string
  ) {
    if (status && !issueStatuses.has(status)) throw new BadRequestException('Unsupported issue request status');
    const parsedLimit = limit === undefined ? 50 : Number(limit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit <= 0) throw new BadRequestException('limit must be a positive integer');
    return this.service.listIssueRequests(
      requiredUuid(actor, 'actorId'),
      requiredUuid(warehouseId, 'warehouseId'),
      status,
      parsedLimit
    );
  }

  @Get('issue-requests/:id')
  findIssueRequest(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string
  ) {
    return this.service.findIssueRequest(requiredUuid(actor, 'actorId'), requiredUuid(id, 'issueRequestId'));
  }

  @Post('issue-requests/:id/submit')
  submitIssueRequest(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    requiredIdempotencyKey(idempotencyKey);
    return this.service.submitIssueRequest(
      requiredUuid(actor, 'actorId'),
      requiredUuid(id, 'issueRequestId'),
      positiveVersion(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('issue-requests/:id/approve')
  approveIssueRequest(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number }
  ) {
    requiredIdempotencyKey(idempotencyKey);
    return this.service.approveIssueRequest(
      requiredUuid(actor, 'actorId'),
      requiredUuid(id, 'issueRequestId'),
      positiveVersion(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('issue-requests/:id/allocate')
  allocateIssueRequest(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: AllocateIssueRequestInput
  ) {
    positiveVersion(body.expectedVersion);
    for (const selection of body.selections ?? []) {
      requiredUuid(selection.lineId, 'lineId');
      requiredUuid(selection.batchId, 'batchId');
      requiredUuid(selection.locationId, 'locationId');
      wholeCase(selection.quantity, 'allocation quantity');
    }
    return this.service.allocateIssueRequest(
      requiredUuid(actor, 'actorId'),
      requiredUuid(id, 'issueRequestId'),
      body,
      requiredIdempotencyKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('issue-requests/:id/pick-tasks')
  createPickTask(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; assignedTo?: string }
  ) {
    requiredIdempotencyKey(idempotencyKey);
    if (body.assignedTo) requiredUuid(body.assignedTo, 'assignedTo');
    return this.service.createPickTask(
      requiredUuid(actor, 'actorId'),
      requiredUuid(id, 'issueRequestId'),
      positiveVersion(body.expectedVersion),
      body.assignedTo,
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('pick-tasks/:taskId/scan')
  confirmPick(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('taskId') taskId: string,
    @Req() request: { correlationId?: string },
    @Body() body: { allocationId?: string; barcode?: string; quantity?: number; expectedVersion?: number }
  ) {
    requiredIdempotencyKey(idempotencyKey);
    if (!body.barcode?.trim()) throw new BadRequestException('barcode is required');
    return this.service.confirmPick(
      requiredUuid(actor, 'actorId'),
      requiredUuid(taskId, 'pickTaskId'),
      requiredUuid(body.allocationId, 'allocationId'),
      body.barcode,
      wholeCase(body.quantity, 'picked quantity'),
      positiveVersion(body.expectedVersion),
      requiredIdempotencyKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId')
    );
  }

  @Post('issue-requests/:id/post')
  postGoodsIssue(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    return this.service.postGoodsIssue(
      requiredUuid(actor, 'actorId'),
      requiredUuid(id, 'issueRequestId'),
      positiveVersion(body.expectedVersion),
      requiredIdempotencyKey(idempotencyKey),
      requiredUuid(request.correlationId, 'correlationId'),
      body.reason
    );
  }

  @Post('issue-requests/:id/cancel')
  cancelIssueRequest(
    @Headers('x-actor-id') actor: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Req() request: { correlationId?: string },
    @Body() body: { expectedVersion?: number; reason?: string }
  ) {
    requiredIdempotencyKey(idempotencyKey);
    if (!body.reason?.trim()) throw new BadRequestException('reason is required');
    return this.service.cancelIssueRequest(
      requiredUuid(actor, 'actorId'),
      requiredUuid(id, 'issueRequestId'),
      positiveVersion(body.expectedVersion),
      requiredUuid(request.correlationId, 'correlationId'),
      body.reason
    );
  }
}
