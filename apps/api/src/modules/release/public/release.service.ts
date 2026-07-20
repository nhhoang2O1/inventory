import { createHash } from 'node:crypto';
import { ConflictException,ForbiddenException,Injectable } from '@nestjs/common';
import { ReleaseDatabaseService } from './release-database.service.js';
type GateType='REGRESSION'|'MIGRATION_DRY_RUN'|'PERFORMANCE'|'SECURITY'|'BACKUP_RESTORE'|'UAT'|'RECONCILIATION'|'SMOKE'|'GO_NO_GO';
type GateStatus='PASSED'|'FAILED'|'BLOCKED';
interface ReadinessRow{observed_at:string;inventory_variance_count:string;stale_outbox_count:string;outbox_dead_letter_count:string;integration_dead_letter_count:string;stale_idempotency_count:string;active_stocktake_lock_count:string;}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
@Injectable()
export class ReleaseService{
  static readonly expectedMigration='0017_phase10_release_readiness.sql';
  constructor(private readonly db:ReleaseDatabaseService){}
  async publicReadiness(){
    const migration=await this.db.query<{version:string}>('SELECT version FROM platform.schema_migration ORDER BY version DESC LIMIT 1');
    const snapshot=(await this.db.query<ReadinessRow>('SELECT * FROM platform.release_readiness_snapshot'))[0];
    if(!snapshot)throw new Error('Release readiness snapshot unavailable');
    const checks={inventoryVariance:Number(snapshot.inventory_variance_count),staleOutbox:Number(snapshot.stale_outbox_count),
      outboxDeadLetters:Number(snapshot.outbox_dead_letter_count),integrationDeadLetters:Number(snapshot.integration_dead_letter_count),
      staleIdempotency:Number(snapshot.stale_idempotency_count),activeStocktakeLocks:Number(snapshot.active_stocktake_lock_count)};
    const blocking=Object.values(checks).some((value)=>value!==0)||migration[0]?.version!==ReleaseService.expectedMigration;
    return{status:blocking?'degraded':'ready',database:'ok',migration:migration[0]?.version??null,expectedMigration:ReleaseService.expectedMigration,checks,observedAt:snapshot.observed_at};
  }
  async readiness(actorId:string){if(!await this.db.hasPermission(actorId,'RELEASE.VIEW'))throw new ForbiddenException('RELEASE.VIEW is required');return this.publicReadiness();}
  async listGates(actorId:string,releaseVersion:string){if(!await this.db.hasPermission(actorId,'RELEASE.VIEW'))throw new ForbiddenException('RELEASE.VIEW is required');
    return this.db.query(`SELECT id,release_version,environment,gate_type,status,evidence,executed_by,correlation_id,executed_at
      FROM platform.release_gate_run WHERE release_version=$1 ORDER BY executed_at,gate_type`,[releaseVersion]);}
  async recordGate(actorId:string,input:{releaseVersion:string;environment:'TEST'|'STAGING'|'PRODUCTION';gateType:GateType;status:GateStatus;evidence?:unknown},key:string,correlationId:string){
    const normalized={...input,releaseVersion:input.releaseVersion.trim(),evidence:input.evidence??{}};if(!normalized.releaseVersion)throw new ConflictException('releaseVersion is required');const requestHash=digest(normalized);
    return this.db.transaction(async(client)=>{
      if(!await this.db.hasPermission(actorId,'RELEASE.MANAGE',client))throw new ForbiddenException('RELEASE.MANAGE is required');
      const replay=await client.query<{id:string;request_hash:string}>(`SELECT id,request_hash FROM platform.release_gate_run WHERE executed_by=$1 AND idempotency_key=$2`,[actorId,key]);
      if(replay.rows[0]){if(replay.rows[0].request_hash!==requestHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return{id:replay.rows[0].id,replayed:true};}
      const inserted=await client.query<{id:string}>(`INSERT INTO platform.release_gate_run
        (release_version,environment,gate_type,status,evidence,executed_by,correlation_id,idempotency_key,request_hash)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING id`,
      [normalized.releaseVersion,input.environment,input.gateType,input.status,JSON.stringify(normalized.evidence),actorId,correlationId,key,requestHash]);
      const id=inserted.rows[0]?.id;if(!id)throw new Error('Failed to record release gate');
      await client.query(`INSERT INTO audit.audit_event(actor_id,action,resource_type,resource_id,correlation_id,after_data)
        VALUES($1,'RECORD_GATE','RELEASE_GATE',$2,$3,$4::jsonb)`,[actorId,id,correlationId,JSON.stringify(normalized)]);
      return{id,replayed:false};
    });
  }
}
