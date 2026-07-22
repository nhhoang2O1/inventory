import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { WarehouseLayoutService, type SaveLayoutInput } from './warehouse-layout.service.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function checkUuid(value: string | undefined, name: string): string {
  if (!value || !uuidPattern.test(value)) throw new BadRequestException(`${name} must be UUID`);
  return value;
}

@Controller('warehouse-layout')
export class WarehouseLayoutController {
  constructor(private readonly service: WarehouseLayoutService) {}

  @Get()
  getLayout(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined
  ) {
    checkUuid(actor, 'actorId');
    return this.service.getLayout(checkUuid(warehouseId, 'warehouseId'));
  }

  @Post('save')
  saveLayout(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Body() body: SaveLayoutInput
  ) {
    const actorId = checkUuid(actor, 'actorId');
    const whId = checkUuid(warehouseId, 'warehouseId');
    return this.service.saveLayout(actorId, whId, body);
  }

  @Post('publish/:id')
  publishLayout(
    @Headers('x-actor-id') actor: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Param('id') layoutId: string
  ) {
    const actorId = checkUuid(actor, 'actorId');
    const whId = checkUuid(warehouseId, 'warehouseId');
    return this.service.publishLayout(actorId, whId, checkUuid(layoutId, 'layoutId'));
  }
}
