import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Req } from '@nestjs/common';
import { PurchaseOrderService,type CreatePurchaseOrderInput } from './purchase-order.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
function key(value:string|undefined){if(!value||value.length<16||value.length>128)throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');return value;}
function version(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<=0)throw new BadRequestException('expectedVersion must be a positive integer');return Number(value);}
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}

  @Get()
  listAll() {
    return this.service.listAllPOs();
  }

  @Post('create-public')
  createPublic(@Body() body: any) {
    return this.service.createPublicPO(body);
  }

  @Get(':id')
  find(@Headers('x-actor-id') actor: string | undefined, @Param('id') poId: string) {
    return this.service.findOne(id(actor || '00000000-0000-0000-0000-000000000001', 'actorId'), id(poId, 'purchaseOrderId'));
  }
}
