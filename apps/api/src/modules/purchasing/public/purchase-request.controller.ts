import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Req } from '@nestjs/common';
import { PurchaseRequestService,type ConvertPurchaseRequestInput,type CreatePurchaseRequestInput } from './purchase-request.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
function key(value:string|undefined){if(!value||value.length<16||value.length>128)throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');return value;}
function version(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<=0)throw new BadRequestException('expectedVersion must be a positive integer');return Number(value);}
@Controller('purchase-requests')
export class PurchaseRequestController{
  constructor(private readonly service:PurchaseRequestService){}
  @Post() create(@Headers('x-actor-id') actor:string|undefined,@Headers('idempotency-key') k:string|undefined,@Req() req:{correlationId?:string},@Body() body:CreatePurchaseRequestInput){
    id(body.warehouseId,'warehouseId'); if(body.supplierId)id(body.supplierId,'supplierId'); for(const line of body.lines??[]){id(line.skuId,'skuId');id(line.uomId,'uomId');if(line.suggestedSupplierId)id(line.suggestedSupplierId,'suggestedSupplierId');}
    return this.service.create(id(actor,'actorId'),body,key(k),id(req.correlationId,'correlationId'));
  }
  @Get(':id') find(@Headers('x-actor-id') actor:string|undefined,@Param('id') requestId:string){return this.service.findOne(id(actor,'actorId'),id(requestId,'purchaseRequestId'));}
  @Post(':id/submit') submit(@Headers('x-actor-id') actor:string|undefined,@Param('id') requestId:string,@Req() req:{correlationId?:string},@Body() body:{expectedVersion?:number}){
    return this.service.submit(id(actor,'actorId'),id(requestId,'purchaseRequestId'),version(body.expectedVersion),id(req.correlationId,'correlationId'));
  }
  @Post(':id/approve') approve(@Headers('x-actor-id') actor:string|undefined,@Param('id') requestId:string,@Req() req:{correlationId?:string},@Body() body:{expectedVersion?:number;reason?:string}){
    return this.service.decide(id(actor,'actorId'),id(requestId,'purchaseRequestId'),version(body.expectedVersion),'APPROVED',body.reason??'',id(req.correlationId,'correlationId'));
  }
  @Post(':id/reject') reject(@Headers('x-actor-id') actor:string|undefined,@Param('id') requestId:string,@Req() req:{correlationId?:string},@Body() body:{expectedVersion?:number;reason?:string}){
    return this.service.decide(id(actor,'actorId'),id(requestId,'purchaseRequestId'),version(body.expectedVersion),'REJECTED',body.reason??'',id(req.correlationId,'correlationId'));
  }
  @Post(':id/convert-to-po') convert(@Headers('x-actor-id') actor:string|undefined,@Headers('idempotency-key') k:string|undefined,@Param('id') requestId:string,@Req() req:{correlationId?:string},@Body() body:ConvertPurchaseRequestInput&{expectedVersion?:number}){
    id(body.supplierId,'supplierId');if(body.businessCalendarId)id(body.businessCalendarId,'businessCalendarId');for(const price of body.prices??[])id(price.prLineId,'prLineId');
    return this.service.convert(id(actor,'actorId'),id(requestId,'purchaseRequestId'),version(body.expectedVersion),body,key(k),id(req.correlationId,'correlationId'));
  }
}
