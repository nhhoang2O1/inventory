import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchasingDatabaseService } from './purchasing-database.service.js';

export interface SupplierInput {
  code:string; name:string; phone?:string; contactEmail?:string; paymentTerms?:string;
  standardLeadTimeDays:number; businessCalendarId?:string;
}

@Injectable()
export class SupplierService {
  constructor(private readonly db: PurchasingDatabaseService) {}

  async create(actorId:string,data:SupplierInput,correlationId:string) {
    if(!await this.db.hasPermission(actorId,'SUPPLIER.MANAGE'))throw new ForbiddenException('SUPPLIER.MANAGE is required');
    const normalized={code:data.code.trim().toUpperCase(),name:data.name.trim(),phone:data.phone?.trim()||null,
      contactEmail:data.contactEmail?.trim().toLowerCase()||null,paymentTerms:data.paymentTerms?.trim()||null,
      standardLeadTimeDays:data.standardLeadTimeDays,businessCalendarId:data.businessCalendarId??null};
    if(!normalized.code||!normalized.name)throw new ConflictException('Supplier code and name are required');
    if(!Number.isSafeInteger(normalized.standardLeadTimeDays)||normalized.standardLeadTimeDays<0)throw new ConflictException('Standard lead time days must be a non-negative integer');
    if(normalized.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.contactEmail))throw new ConflictException('Invalid contact email');
    try{return await this.db.transaction(async(client)=>{
      if(normalized.businessCalendarId&&(await client.query(`SELECT 1 FROM purchasing.business_calendar WHERE id=$1 AND status='ACTIVE'`,[normalized.businessCalendarId])).rowCount===0)throw new NotFoundException('Active business calendar not found');
      const inserted=await client.query<{id:string}>(`INSERT INTO purchasing.supplier
        (code,name,phone,contact_email,payment_terms,standard_lead_time_days,business_calendar_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[normalized.code,normalized.name,normalized.phone,normalized.contactEmail,
          normalized.paymentTerms,normalized.standardLeadTimeDays,normalized.businessCalendarId]);
      const id=inserted.rows[0]?.id;if(!id)throw new Error('Failed to create supplier');
      await this.audit(client,actorId,'CREATE',id,correlationId,normalized);
      return{id,...normalized};
    });}catch(error){if(error instanceof Error&&error.message.includes('unique constraint'))throw new ConflictException('Supplier code already exists');throw error;}
  }

  async findAll(actorId:string){
    if(!await this.db.hasPermission(actorId,'SUPPLIER.VIEW'))throw new ForbiddenException('SUPPLIER.VIEW is required');
    return this.db.query(`SELECT id,code,name,phone,contact_email AS "contactEmail",payment_terms AS "paymentTerms",
      standard_lead_time_days AS "standardLeadTimeDays",business_calendar_id AS "businessCalendarId",status,version,
      created_at AS "createdAt" FROM purchasing.supplier ORDER BY code`);
  }

  async findOne(actorId:string,id:string){
    if(!await this.db.hasPermission(actorId,'SUPPLIER.VIEW'))throw new ForbiddenException('SUPPLIER.VIEW is required');
    const rows=await this.db.query(`SELECT id,code,name,phone,contact_email AS "contactEmail",payment_terms AS "paymentTerms",
      standard_lead_time_days AS "standardLeadTimeDays",business_calendar_id AS "businessCalendarId",status,version,
      created_at AS "createdAt" FROM purchasing.supplier WHERE id=$1`,[id]);
    if(!rows[0])throw new NotFoundException('Supplier not found');return rows[0];
  }

  private audit(client:import('pg').PoolClient,actorId:string,action:string,id:string,correlationId:string,after:unknown){
    return client.query(`INSERT INTO audit.audit_event (actor_id,action,resource_type,resource_id,correlation_id,after_data)
      VALUES ($1,$2,'SUPPLIER',$3,$4,$5::jsonb)`,[actorId,action,id,correlationId,JSON.stringify(after)]);
  }
}
