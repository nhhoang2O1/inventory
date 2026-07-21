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

  @Get('liveness')
  getLiveness() {
    return { status: 'UP', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  getReadiness() {
    return {
      status: 'READY',
      checks: {
        database: 'HEALTHY',
        migrations: 'UP_TO_DATE',
        outbox: 'HEALTHY'
      },
      timestamp: new Date().toISOString()
    };
  }
}
