import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { GateService, CreateCheckInDto, WeighInDto, AssignDockDto, WeighOutDto, ConfirmDockReceiptDto } from './gate.service.js';

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

  @Post('confirm-dock-receipt')
  async confirmDockReceipt(@Body() dto: ConfirmDockReceiptDto) {
    return await this.gateService.confirmDockReceipt(dto);
  }

  @Post('weigh-out')
  async weighOut(@Body() dto: WeighOutDto) {
    return await this.gateService.weighOut(dto);
  }

  @Post('check-out')
  async checkOut(@Body() body: { truckEntryId: string }) {
    return await this.gateService.checkOut(body.truckEntryId);
  }

  @Get('approved-orders')
  async listApprovedOrders() {
    return await this.gateService.listApprovedOrders();
  }

  @Get('docks')
  async listDocks() {
    return await this.gateService.listDocks();
  }

  @Get('entries')
  async listEntries(@Query('status') status?: string) {
    return await this.gateService.listEntries(status);
  }

  @Get('entries/:id')
  async getEntryById(@Param('id') id: string) {
    return await this.gateService.getEntryById(id);
  }

  @Post('reset-data')
  async resetData() {
    return await this.gateService.resetData();
  }

  @Get('reports/po/:poCode/generate')
  async generatePoReport(@Param('poCode') poCode: string) {
    return await this.gateService.generatePoPdfReport(poCode);
  }

  @Get('reports/po/:poCode/pdf')
  async downloadPoReportPdf(@Param('poCode') poCode: string, @Res() res: any) {
    const result = await this.gateService.generatePoPdfReport(poCode);
    if (result && result.pdfPath && fs.existsSync(result.pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(result.pdfPath)}"`);
      fs.createReadStream(result.pdfPath).pipe(res);
    } else {
      res.status(404).send('PDF report not found');
    }
  }
}
