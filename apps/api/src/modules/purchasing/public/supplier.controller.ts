import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Req } from '@nestjs/common';
import { SupplierService,type SupplierInput } from './supplier.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
@Controller('suppliers')
export class SupplierController{
  constructor(private readonly service:SupplierService){}
  @Post()create(@Headers('x-actor-id')actor:string|undefined,@Req()req:{correlationId?:string},@Body()body:SupplierInput){
    if(body.businessCalendarId)id(body.businessCalendarId,'businessCalendarId');return this.service.create(id(actor,'actorId'),body,id(req.correlationId,'correlationId'));
  }
  @Get()findAll(@Headers('x-actor-id')actor:string|undefined){return this.service.findAll(id(actor,'actorId'));}
  @Get(':id')findOne(@Headers('x-actor-id')actor:string|undefined,@Param('id')supplierId:string){return this.service.findOne(id(actor,'actorId'),id(supplierId,'supplierId'));}
}
