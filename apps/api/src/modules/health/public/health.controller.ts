import { Controller, Get } from '@nestjs/common';
import type { ApiEnvelope, HealthResponse } from '@wms/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): ApiEnvelope<HealthResponse> {
    const timestamp = new Date().toISOString();
    return {
      data: {
        status: 'ok',
        service: 'warehouse-wms-api',
        version: '0.2.0',
        timestamp
      },
      meta: {
        correlationId: 'provided-by-response-header',
        timestamp
      }
    };
  }
}
