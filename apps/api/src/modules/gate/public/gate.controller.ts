import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GateService, CreateCheckInDto, WeighInDto, AssignDockDto, WeighOutDto } from './gate.service.js';

@Controller('gate')
export class GateController {
  constructor(private readonly gateService: GateService) {}

  @Post('check-in')
  async checkIn(@Body() dto: CreateCheckInDto) {
    return await this.gateService.createCheckIn(dto);
  }

  @Post('weigh-in')
  async weighIn(@Body() dto: WeighInDto) {
    return await this.gateService.weighIn(dto);
  }

  @Post('assign-dock')
  async assignDock(@Body() dto: AssignDockDto) {
    return await this.gateService.assignDock(dto);
  }

  @Post('weigh-out')
  async weighOut(@Body() dto: WeighOutDto) {
    return await this.gateService.weighOut(dto);
  }

  @Post('check-out')
  async checkOut(@Body() body: { truckEntryId: string }) {
    return await this.gateService.checkOut(body.truckEntryId);
  }

  @Get('entries')
  async listEntries(@Query('status') status?: string) {
    return await this.gateService.listEntries(status);
  }

  @Get('entries/:id')
  async getEntryById(@Param('id') id: string) {
    return await this.gateService.getEntryById(id);
  }
}
