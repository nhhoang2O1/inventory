import { BadRequestException,Body,Controller,Get,Headers,Post,Query,Req } from '@nestjs/common';
import { ReleaseService } from './release.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const environments=new Set(['TEST','STAGING','PRODUCTION']);
const gateTypes=new Set(['REGRESSION','MIGRATION_DRY_RUN','PERFORMANCE','SECURITY','BACKUP_RESTORE','UAT','RECONCILIATION','SMOKE','GO_NO_GO']);
const statuses=new Set(['PASSED','FAILED','BLOCKED']);
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
function key(value:string|undefined){if(!value||value.length<16||value.length>128)throw new BadRequestException('Idempotency-Key must contain 16 to 128 characters');return value;}
@Controller('release')
export class ReleaseController{
  constructor(private readonly service:ReleaseService){}
  @Get('readiness')readiness(@Headers('x-actor-id')actor:string|undefined){return this.service.readiness(id(actor,'actorId'));}
  @Get('gates')gates(@Headers('x-actor-id')actor:string|undefined,@Query('releaseVersion')version:string|undefined){
    if(!version?.trim()||version.length>128)throw new BadRequestException('releaseVersion must contain 1 to 128 characters');return this.service.listGates(id(actor,'actorId'),version);}
  @Post('gates')record(@Headers('x-actor-id')actor:string|undefined,@Headers('idempotency-key')k:string|undefined,@Req()request:{correlationId?:string},
    @Body()body:{releaseVersion:string;environment:'TEST'|'STAGING'|'PRODUCTION';gateType:'REGRESSION'|'MIGRATION_DRY_RUN'|'PERFORMANCE'|'SECURITY'|'BACKUP_RESTORE'|'UAT'|'RECONCILIATION'|'SMOKE'|'GO_NO_GO';status:'PASSED'|'FAILED'|'BLOCKED';evidence?:unknown}){
    if(!body||typeof body.releaseVersion!=='string'||body.releaseVersion.trim().length===0||body.releaseVersion.length>128)
      throw new BadRequestException('releaseVersion must contain 1 to 128 characters');
    if(!environments.has(body.environment))throw new BadRequestException('Invalid release environment');
    if(!gateTypes.has(body.gateType))throw new BadRequestException('Invalid gate type');
    if(!statuses.has(body.status))throw new BadRequestException('Invalid gate status');
    if(body.evidence!==undefined&&(body.evidence===null||typeof body.evidence!=='object'||Array.isArray(body.evidence)))
      throw new BadRequestException('evidence must be a JSON object');
    return this.service.recordGate(id(actor,'actorId'),body,key(k),id(request.correlationId,'correlationId'));}
}
