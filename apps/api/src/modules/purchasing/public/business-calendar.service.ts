import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchasingDatabaseService } from './purchasing-database.service.js';

@Injectable()
export class BusinessCalendarService {
  constructor(private readonly db: PurchasingDatabaseService) {}

  async create(actorId: string, input: { code: string; name: string; timezone?: string; weekendDays?: number[] }, correlationId: string) {
    if (!await this.db.hasPermission(actorId, 'PURCHASING.CALENDAR_MANAGE')) throw new ForbiddenException('PURCHASING.CALENDAR_MANAGE is required');
    const code=input.code.trim().toUpperCase(), name=input.name.trim(), timezone=input.timezone?.trim()||'Asia/Ho_Chi_Minh';
    const weekendDays=[...new Set(input.weekendDays??[0,6])];
    if(!code||!name||weekendDays.some((day)=>!Number.isInteger(day)||day<0||day>6)) throw new ConflictException('Calendar code, name and valid weekend days are required');
    try { Intl.DateTimeFormat('en-US',{timeZone:timezone}); } catch { throw new ConflictException('Invalid IANA timezone'); }
    return this.db.transaction(async(client)=>{
      const inserted=await client.query<{id:string}>(`INSERT INTO purchasing.business_calendar
        (code,name,timezone,weekend_days,created_by,correlation_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [code,name,timezone,weekendDays,actorId,correlationId]);
      const id=inserted.rows[0]?.id; if(!id)throw new Error('Failed to create business calendar');
      await this.audit(client,actorId,'CREATE',id,correlationId,{code,name,timezone,weekendDays});
      return {id,code,name,timezone,weekendDays};
    }).catch((error:unknown)=>{if(error instanceof Error&&error.message.includes('unique constraint'))throw new ConflictException('Business calendar code already exists');throw error;});
  }

  async configureDay(actorId:string,id:string,input:{date:string;isWorkingDay:boolean;description?:string},correlationId:string){
    if(!await this.db.hasPermission(actorId,'PURCHASING.CALENDAR_MANAGE'))throw new ForbiddenException('PURCHASING.CALENDAR_MANAGE is required');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(`${input.date}T00:00:00Z`)))throw new ConflictException('date must be YYYY-MM-DD');
    return this.db.transaction(async(client)=>{
      if((await client.query('SELECT 1 FROM purchasing.business_calendar WHERE id=$1',[id])).rowCount===0)throw new NotFoundException('Business calendar not found');
      await client.query(`INSERT INTO purchasing.business_calendar_day
        (business_calendar_id,calendar_date,is_working_day,description,configured_by,correlation_id)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (business_calendar_id,calendar_date) DO UPDATE SET
        is_working_day=excluded.is_working_day,description=excluded.description,configured_by=excluded.configured_by,
        correlation_id=excluded.correlation_id,configured_at=now()`,[id,input.date,input.isWorkingDay,input.description?.trim()||null,actorId,correlationId]);
      await this.audit(client,actorId,'CONFIGURE_DAY',id,correlationId,input);
      return {id,date:input.date,isWorkingDay:input.isWorkingDay};
    });
  }

  async findAll(actorId:string){
    if(!await this.db.hasPermission(actorId,'SUPPLIER.VIEW'))throw new ForbiddenException('SUPPLIER.VIEW is required');
    return this.db.query(`SELECT id,code,name,timezone,weekend_days AS "weekendDays",status,created_at AS "createdAt"
      FROM purchasing.business_calendar ORDER BY code`);
  }

  private audit(client:import('pg').PoolClient,actorId:string,action:string,id:string,correlationId:string,after:unknown){
    return client.query(`INSERT INTO audit.audit_event (actor_id,action,resource_type,resource_id,correlation_id,after_data)
      VALUES ($1,$2,'BUSINESS_CALENDAR',$3,$4,$5::jsonb)`,[actorId,action,id,correlationId,JSON.stringify(after)]);
  }
}
