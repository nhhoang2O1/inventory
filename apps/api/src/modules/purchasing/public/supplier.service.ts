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

  async findAllPublic() {
    return this.db.query(`
      SELECT s.id, s.code, s.name, s.phone,
             s.standard_lead_time_days AS "standardLeadTimeDays",
             s.status, s.created_at AS "createdAt",
             (
               SELECT json_agg(json_build_object(
                 'id', sp.id,
                 'productId', p.id,
                 'productCode', p.code,
                 'productName', p.name,
                 'leadTimeDays', sp.lead_time_days,
                 'unitPrice', sp.unit_price
               ))
               FROM purchasing.supplier_product sp
               JOIN catalog.product p ON p.id = sp.product_id
               WHERE sp.supplier_id = s.id AND p.status = 'ACTIVE'
             ) AS products
      FROM purchasing.supplier s
      WHERE s.status = 'ACTIVE'
      ORDER BY s.code
    `);
  }

  async createPublic(data: { code: string; name: string; phone?: string; standardLeadTimeDays: number; productIds?: string[] }) {
    const code = data.code.trim().toUpperCase();
    const name = data.name.trim();
    const phone = data.phone?.trim() || null;
    const leadTime = Number(data.standardLeadTimeDays) || 2;

    const inserted = await this.db.query<{ id: string }>(`
      INSERT INTO purchasing.supplier (code, name, phone, standard_lead_time_days)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [code, name, phone, leadTime]);

    const id = inserted[0]?.id;

    if (id && Array.isArray(data.productIds) && data.productIds.length > 0) {
      for (const prodId of data.productIds) {
        await this.db.query(`
          INSERT INTO purchasing.supplier_product (supplier_id, product_id, lead_time_days, unit_price)
          VALUES ($1, $2, $3, 240000.00)
          ON CONFLICT (supplier_id, product_id) DO NOTHING
        `, [id, prodId, leadTime]);
      }
    }

    return { id, code, name, phone, standardLeadTimeDays: leadTime };
  }

  async deletePublic(id: string) {
    return await this.db.query(`DELETE FROM purchasing.supplier WHERE id = $1`, [id]);
  }

  async getSupplierProducts(supplierId: string) {
    return this.db.query(`
      SELECT sp.id, p.id AS "productId", p.code AS "productCode", p.name AS "productName",
             sp.lead_time_days AS "leadTimeDays", sp.unit_price AS "unitPrice"
      FROM purchasing.supplier_product sp
      JOIN catalog.product p ON p.id = sp.product_id
      WHERE sp.supplier_id = $1
      ORDER BY p.name
    `, [supplierId]);
  }

  private audit(client:import('pg').PoolClient,actorId:string,action:string,id:string,correlationId:string,after:unknown){
    return client.query(`INSERT INTO audit.audit_event (actor_id,action,resource_type,resource_id,correlation_id,after_data)
      VALUES ($1,$2,'SUPPLIER',$3,$4,$5::jsonb)`,[actorId,action,id,correlationId,JSON.stringify(after)]);
  }
}
