import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Query,Req } from '@nestjs/common';
import { PurchaseOrderService,type CreatePurchaseOrderInput } from './purchase-order.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
function key(value:string|undefined){if(!value||value.length<16||value.length>128)throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');return value;}
function version(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<=0)throw new BadRequestException('expectedVersion must be a positive integer');return Number(value);}
@Controller('purchase-orders')
export class PurchaseOrderController{constructor(private readonly service:PurchaseOrderService){}
  @Get()findAll(@Headers('x-actor-id')actor:string|undefined,@Query('warehouseId')warehouseId:string|undefined){
    return this.service.findAll(id(actor,'actorId'),warehouseId?id(warehouseId,'warehouseId'):undefined);}
  @Post()create(@Headers('x-actor-id')actor:string|undefined,@Headers('idempotency-key')k:string|undefined,@Req()req:{correlationId?:string},@Body()body:CreatePurchaseOrderInput){
    id(body.supplierId,'supplierId');id(body.warehouseId,'warehouseId');if(body.businessCalendarId)id(body.businessCalendarId,'businessCalendarId');for(const line of body.lines??[]){id(line.skuId,'skuId');id(line.uomId,'uomId');}
    return this.service.create(id(actor,'actorId'),body,key(k),id(req.correlationId,'correlationId'));}
  @Get(':id')find(@Headers('x-actor-id')actor:string|undefined,@Param('id')poId:string){return this.service.findOne(id(actor,'actorId'),id(poId,'purchaseOrderId'));}
  @Post(':id/submit')submit(@Headers('x-actor-id')actor:string|undefined,@Param('id')poId:string,@Req()req:{correlationId?:string},@Body()body:{expectedVersion?:number}){return this.service.submit(id(actor,'actorId'),id(poId,'purchaseOrderId'),version(body.expectedVersion),id(req.correlationId,'correlationId'));}
  @Post(':id/approve')approve(@Headers('x-actor-id')actor:string|undefined,@Param('id')poId:string,@Req()req:{correlationId?:string},@Body()body:{expectedVersion?:number;reason?:string}){return this.service.approve(id(actor,'actorId'),id(poId,'purchaseOrderId'),version(body.expectedVersion),id(req.correlationId,'correlationId'),body.reason);}
  @Post(':id/send')send(@Headers('x-actor-id')actor:string|undefined,@Param('id')poId:string,@Req()req:{correlationId?:string},@Body()body:{expectedVersion?:number}){return this.service.send(id(actor,'actorId'),id(poId,'purchaseOrderId'),version(body.expectedVersion),id(req.correlationId,'correlationId'));}
  @Post(':id/close')close(@Headers('x-actor-id')actor:string|undefined,@Param('id')poId:string,@Req()req:{correlationId?:string},@Body()body:{expectedVersion?:number;reason?:string}){return this.service.close(id(actor,'actorId'),id(poId,'purchaseOrderId'),version(body.expectedVersion),body.reason??'',id(req.correlationId,'correlationId'));}
}
