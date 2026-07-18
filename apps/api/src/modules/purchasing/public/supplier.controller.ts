import { Body, Controller, Get, Headers, Param, Post, BadRequestException } from '@nestjs/common';
import { SupplierService } from './supplier.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requiredUuid(value: string | undefined, name: string) {
  if (!value || !uuid.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

@Controller('suppliers')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Post()
  create(
    @Headers('x-actor-id') actor: string | undefined,
    @Body() body: { code: string; name: string; phone?: string; standardLeadTimeDays: number }
  ) {
    requiredUuid(actor, 'actorId');
    return this.service.create(body);
  }

  @Get()
  findAll(@Headers('x-actor-id') actor: string | undefined) {
    requiredUuid(actor, 'actorId');
    return this.service.findAll();
  }

  @Get(':id')
  findOne(
    @Headers('x-actor-id') actor: string | undefined,
    @Param('id') id: string
  ) {
    requiredUuid(actor, 'actorId');
    return this.service.findOne(requiredUuid(id, 'supplierId'));
  }
}
