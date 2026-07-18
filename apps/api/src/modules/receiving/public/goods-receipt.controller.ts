import { Body, Controller, Get, Headers, Param, Post, BadRequestException, Req } from '@nestjs/common';
import { GoodsReceiptService, type CreateGoodsReceiptInput } from './goods-receipt.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requiredUuid(value: string | undefined, name: string) {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

@Controller('goods-receipts')
export class GoodsReceiptController {
  constructor(private readonly service: GoodsReceiptService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Body() body: CreateGoodsReceiptInput
  ) {
    const actorId = requiredUuid(actor, 'actorId');
    requiredUuid(body.poId, 'poId');
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }
    if (body.lines) {
      for (const line of body.lines) {
        requiredUuid(line.poLineId, 'poLineId');
        requiredUuid(line.skuId, 'skuId');
        requiredUuid(line.batchId, 'batchId');
        requiredUuid(line.uomId, 'uomId');
        requiredUuid(line.locationId, 'locationId');
      }
    }
    return this.service.create(actorId, body);
  }

  @Get(':id')
  findOne(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string
  ) {
    requiredUuid(actor, 'actorId');
    return this.service.findOne(requiredUuid(id, 'goodsReceiptId'));
  }

  @Post(':id/post')
  post(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string,
    @Req() req: { correlationId: string },
    @Body() body?: { reason?: string }
  ) {
    const actorId = requiredUuid(actor, 'actorId');
    const correlationId = requiredUuid(req.correlationId, 'correlationId');
    return this.service.post(actorId, requiredUuid(id, 'goodsReceiptId'), correlationId, body?.reason);
  }
}
