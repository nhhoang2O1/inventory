import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Req } from '@nestjs/common';
import { BusinessCalendarService } from './business-calendar.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
@Controller('business-calendars')
export class BusinessCalendarController{
  constructor(private readonly service:BusinessCalendarService){}
  @Post()create(@Headers('x-actor-id')actor:string|undefined,@Req()req:{correlationId?:string},@Body()body:{code:string;name:string;timezone?:string;weekendDays?:number[]}){
    return this.service.create(id(actor,'actorId'),body,id(req.correlationId,'correlationId'));
  }
  @Get()findAll(@Headers('x-actor-id')actor:string|undefined){return this.service.findAll(id(actor,'actorId'));}
  @Post(':id/days')configureDay(@Headers('x-actor-id')actor:string|undefined,@Param('id')calendarId:string,@Req()req:{correlationId?:string},@Body()body:{date:string;isWorkingDay:boolean;description?:string}){
    return this.service.configureDay(id(actor,'actorId'),id(calendarId,'businessCalendarId'),body,id(req.correlationId,'correlationId'));
  }
}
