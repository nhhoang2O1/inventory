import { Body, Controller, Get, Headers, Param, Post, BadRequestException } from '@nestjs/common';
import { PurchaseOrderService, type CreatePurchaseOrderInput } from './purchase-order.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requiredUuid(value: string | undefined, name: string) {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Body() body: CreatePurchaseOrderInput
  ) {
    const actorId = requiredUuid(actor, 'actorId');
    requiredUuid(body.supplierId, 'supplierId');
    if (body.lines) {
      for (const line of body.lines) {
        requiredUuid(line.skuId, 'skuId');
        requiredUuid(line.uomId, 'uomId');
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
    return this.service.findOne(requiredUuid(id, 'purchaseOrderId'));
  }

  @Post(':id/approve')
  approve(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string
  ) {
    const actorId = requiredUuid(actor, 'actorId');
    return this.service.approve(actorId, requiredUuid(id, 'purchaseOrderId'));
  }
}
