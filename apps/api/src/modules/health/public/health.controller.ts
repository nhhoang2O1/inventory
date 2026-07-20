import { Controller, Get,ServiceUnavailableException } from '@nestjs/common';
import type { ApiEnvelope, HealthResponse } from '@wms/contracts';
import { ReleaseService } from '../../release/public/release.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly release:ReleaseService){}
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

  @Get('ready')
  async readiness(){
    try{const result=await this.release.publicReadiness();if(result.status!=='ready')throw new ServiceUnavailableException(result);return result;}
    catch(error){if(error instanceof ServiceUnavailableException)throw error;throw new ServiceUnavailableException('Database or release readiness unavailable');}
  }
}
