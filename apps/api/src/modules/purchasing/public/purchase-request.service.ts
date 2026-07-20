import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalPolicyService } from '../../approval/public/approval-policy.service.js';
import { PurchasingDatabaseService } from './purchasing-database.service.js';

export interface PurchaseRequestLineInput {
  skuId: string;
  quantity: number;
  uomId: string;
  suggestedSupplierId?: string;
  note?: string;
}

export interface CreatePurchaseRequestInput {
  prCode: string;
  warehouseId: string;
  supplierId?: string;
  reason: string;
  requiredByDate?: string;
  lines: PurchaseRequestLineInput[];
}

export interface ConvertPurchaseRequestInput {
  poCode: string;
  supplierId: string;
  businessCalendarId?: string;
  receivingTolerancePercent?: number;
  prices: Array<{ prLineId: string; unitPrice: number; vatRate?: number; exciseTaxRate?: number }>;
}

interface PurchaseRequestRow {
  id: string; pr_code: string; warehouse_id: string; supplier_id: string | null; status: string;
  reason: string; required_by_date: string | null; requested_by: string; submitted_at: string | null;
  approved_by: string | null; approved_at: string | null; decision_reason: string | null;
  converted_po_id: string | null; request_hash: string; version: number; correlation_id: string; created_at: string;
}

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function whole(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ConflictException(`${name} must be a positive whole-case quantity`);
  return value;
}
function dateOnly(value: string | undefined, name: string): string | null {
  if (value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ConflictException(`${name} must be YYYY-MM-DD`);
  }
  return value;
}

@Injectable()
export class PurchaseRequestService {
  constructor(private readonly db: PurchasingDatabaseService, private readonly approval: ApprovalPolicyService) {}

  async create(actorId: string, input: CreatePurchaseRequestInput, idempotencyKey: string, correlationId: string) {
    const normalized = {
      ...input, prCode: input.prCode.trim().toUpperCase(), reason: input.reason.trim(),
      requiredByDate: dateOnly(input.requiredByDate, 'requiredByDate'),
      lines: input.lines?.map((line, index) => ({ ...line, lineNumber: index + 1, quantity: whole(line.quantity, 'quantity') })) ?? []
    };
    if (!normalized.prCode || !normalized.reason || normalized.lines.length === 0) {
      throw new ConflictException('prCode, reason and at least one line are required');
    }
    if (new Set(normalized.lines.map((line) => line.skuId)).size !== normalized.lines.length) {
      throw new ConflictException('A SKU can appear only once in a purchase request');
    }
    const requestHash = hash(normalized);
    return this.db.transaction(async (client) => {
      if (!await this.db.hasAccess(actorId, 'PURCHASING.PR_CREATE', input.warehouseId, client)) {
        throw new ForbiddenException('PURCHASING.PR_CREATE is required for the warehouse scope');
      }
      const replay = await client.query<PurchaseRequestRow>(
        'SELECT * FROM purchasing.purchase_request WHERE requested_by=$1 AND idempotency_key=$2', [actorId,idempotencyKey]
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return { ...(await this.load(client,replay.rows[0])), replayed: true };
      }
      if (input.supplierId) {
        const supplier = await client.query('SELECT 1 FROM purchasing.supplier WHERE id=$1 AND status=\'ACTIVE\'', [input.supplierId]);
        if (supplier.rowCount === 0) throw new NotFoundException('Active supplier not found');
      }
      const inserted = await client.query<PurchaseRequestRow>(`
        INSERT INTO purchasing.purchase_request (
          pr_code,warehouse_id,supplier_id,reason,required_by_date,requested_by,
          idempotency_key,request_hash,correlation_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [normalized.prCode,input.warehouseId,input.supplierId ?? null,normalized.reason,normalized.requiredByDate,
        actorId,idempotencyKey,requestHash,correlationId]);
      const request = inserted.rows[0];
      if (!request) throw new Error('Failed to create purchase request');
      for (const line of normalized.lines) {
        const references = await client.query<{ sku: boolean; uom: boolean }>(`
          SELECT EXISTS(SELECT 1 FROM catalog.sku WHERE id=$1 AND status='ACTIVE') AS sku,
            EXISTS(SELECT 1 FROM catalog.unit_of_measure WHERE id=$2 AND whole_case_only) AS uom`, [line.skuId,line.uomId]);
        if (!references.rows[0]?.sku || !references.rows[0]?.uom) throw new NotFoundException('Active SKU or whole-case UOM not found');
        const sourceSupplier = line.suggestedSupplierId ?? input.supplierId ?? null;
        const estimate = sourceSupplier ? await client.query<{ estimated: string }>(`
          SELECT to_char(purchasing.add_working_days(supplier.business_calendar_id,current_date,supplier.standard_lead_time_days),'YYYY-MM-DD') AS estimated
          FROM purchasing.supplier supplier WHERE supplier.id=$1 AND supplier.status='ACTIVE'`, [sourceSupplier]) : null;
        if (sourceSupplier && !estimate?.rows[0]) throw new NotFoundException('Suggested supplier not found');
        await client.query(`
          INSERT INTO purchasing.purchase_request_line (
            purchase_request_id,line_number,sku_id,requested_quantity,uom_id,suggested_supplier_id,
            estimated_delivery_date,note
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [request.id,line.lineNumber,line.skuId,line.quantity,line.uomId,line.suggestedSupplierId ?? null,
          estimate?.rows[0]?.estimated ?? null,line.note?.trim() || null]);
      }
      await this.audit(client,actorId,'CREATE',request,input.warehouseId,correlationId,undefined,{ status:'DRAFT',lineCount:normalized.lines.length });
      return { ...(await this.load(client,request)), replayed: false };
    });
  }

  async findOne(actorId: string,id: string) {
    const rows=await this.db.query<PurchaseRequestRow>('SELECT * FROM purchasing.purchase_request WHERE id=$1',[id]);
    const request=rows[0]; if(!request) throw new NotFoundException('Purchase request not found');
    if(!await this.db.hasAccess(actorId,'PURCHASING.VIEW',request.warehouse_id)) throw new ForbiddenException('PURCHASING.VIEW is required');
    return this.db.transaction((client)=>this.load(client,request));
  }

  async submit(actorId:string,id:string,expectedVersion:number,correlationId:string) {
    return this.db.transaction(async(client)=>{
      const request=await this.lock(client,id);
      if(!await this.db.hasAccess(actorId,'PURCHASING.PR_CREATE',request.warehouse_id,client)) throw new ForbiddenException('PURCHASING.PR_CREATE is required');
      if(request.requested_by!==actorId) throw new ForbiddenException('Only the requester can submit this purchase request');
      this.state(request,'DRAFT',expectedVersion);
      const lines=await client.query<{ sku_id:string;requested_quantity:string;suggested_supplier_id:string|null }>(
        'SELECT sku_id,requested_quantity,suggested_supplier_id FROM purchasing.purchase_request_line WHERE purchase_request_id=$1',[id]);
      for(const line of lines.rows) {
        const supplier=line.suggested_supplier_id ?? request.supplier_id;
        if(!supplier) continue;
        const policy=await client.query<{ minimum_quantity:string }>(`
          SELECT minimum_quantity FROM catalog.wholesale_quantity_policy
          WHERE sku_id=$1 AND direction='INBOUND' AND (supplier_id IS NULL OR supplier_id=$2)
            AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())
          ORDER BY (supplier_id IS NOT NULL) DESC,valid_from DESC LIMIT 1`,[line.sku_id,supplier]);
        if(policy.rows[0] && Number(line.requested_quantity)<Number(policy.rows[0].minimum_quantity)) {
          throw new ConflictException(`MINIMUM_QUANTITY_NOT_MET:${line.sku_id}:${policy.rows[0].minimum_quantity}`);
        }
      }
      const updated=await client.query<PurchaseRequestRow>(`
        UPDATE purchasing.purchase_request SET status='SUBMITTED',submitted_at=now(),version=version+1,updated_at=now()
        WHERE id=$1 RETURNING *`,[id]);
      await this.audit(client,actorId,'SUBMIT',updated.rows[0]!,request.warehouse_id,correlationId,undefined,{status:'SUBMITTED'});
      return this.load(client,updated.rows[0]!);
    });
  }

  async decide(actorId:string,id:string,expectedVersion:number,decision:'APPROVED'|'REJECTED',reason:string,correlationId:string) {
    if(decision==='REJECTED'&&!reason.trim()) throw new ConflictException('Rejection reason is required');
    return this.db.transaction(async(client)=>{
      const request=await this.lock(client,id);
      if(!await this.db.hasAccess(actorId,'PURCHASING.PR_APPROVE',request.warehouse_id,client)) throw new ForbiddenException('PURCHASING.PR_APPROVE is required');
      this.state(request,'SUBMITTED',expectedVersion);
      const permissions=await this.permissions(client,actorId);
      const check=this.approval.canDecide({status:'PENDING',creatorId:request.requested_by,actorId,fourEyesRequired:true,
        currentLevel:1,decisionLevel:1,requiredPermission:'PURCHASING.PR_APPROVE',actorPermissions:permissions});
      if(!check.allowed) throw new ConflictException(check.code);
      const updated=await client.query<PurchaseRequestRow>(`
        UPDATE purchasing.purchase_request SET status=$2,approved_by=$3,approved_at=now(),decision_reason=$4,
          version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,decision,actorId,reason.trim()||null]);
      await this.audit(client,actorId,decision==='APPROVED'?'APPROVE':'REJECT',updated.rows[0]!,request.warehouse_id,correlationId,reason,{status:decision});
      return this.load(client,updated.rows[0]!);
    });
  }

  async convert(actorId:string,id:string,expectedVersion:number,input:ConvertPurchaseRequestInput,idempotencyKey:string,correlationId:string) {
    const requestHash=hash({id,input});
    return this.db.transaction(async(client)=>{
      const request=await this.lock(client,id);
      if(request.status==='CONVERTED'&&request.converted_po_id) {
        const converted=await client.query<{created_by:string;idempotency_key:string|null;request_hash:string|null}>(
          'SELECT created_by,idempotency_key,request_hash FROM purchasing.purchase_order WHERE id=$1',[request.converted_po_id]);
        if(converted.rows[0]?.created_by!==actorId||converted.rows[0]?.idempotency_key!==idempotencyKey||converted.rows[0]?.request_hash!==requestHash) {
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        }
        return {purchaseRequestId:id,purchaseOrderId:request.converted_po_id,status:'CONVERTED',replayed:true};
      }
      if(!await this.db.hasAccess(actorId,'PURCHASING.PO_CREATE',request.warehouse_id,client)) throw new ForbiddenException('PURCHASING.PO_CREATE is required');
      this.state(request,'APPROVED',expectedVersion);
      const supplierResult=await client.query<{business_calendar_id:string|null;standard_lead_time_days:number}>(
        'SELECT business_calendar_id,standard_lead_time_days FROM purchasing.supplier WHERE id=$1 AND status=\'ACTIVE\'',[input.supplierId]);
      const supplier=supplierResult.rows[0]; if(!supplier) throw new NotFoundException('Active supplier not found');
      const calendarId=input.businessCalendarId ?? supplier.business_calendar_id;
      const delivery=await client.query<{date:string}>(`SELECT to_char(purchasing.add_working_days($1,current_date,$2),'YYYY-MM-DD') AS date`,[calendarId,supplier.standard_lead_time_days]);
      const po=await client.query<{id:string}>(`
        INSERT INTO purchasing.purchase_order (
          po_code,supplier_id,warehouse_id,source_pr_id,business_calendar_id,status,order_date,
          expected_delivery_date,receiving_tolerance_percent,created_by,idempotency_key,request_hash,correlation_id
        ) VALUES ($1,$2,$3,$4,$5,'DRAFT',current_date,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [input.poCode.trim().toUpperCase(),input.supplierId,request.warehouse_id,id,calendarId,delivery.rows[0]?.date,
        input.receivingTolerancePercent ?? 2,actorId,idempotencyKey,requestHash,correlationId]);
      const poId=po.rows[0]?.id; if(!poId) throw new Error('Failed to convert purchase request');
      const lines=await client.query<{id:string;line_number:number;sku_id:string;requested_quantity:string;uom_id:string}>(
        'SELECT id,line_number,sku_id,requested_quantity,uom_id FROM purchasing.purchase_request_line WHERE purchase_request_id=$1 ORDER BY line_number',[id]);
      for(const line of lines.rows){
        const price=input.prices.find((item)=>item.prLineId===line.id); if(!price||price.unitPrice<0) throw new ConflictException(`Price is required for PR line ${line.id}`);
        const inserted=await client.query<{id:string}>(`
          INSERT INTO purchasing.purchase_order_line (po_id,sku_id,ordered_qty,uom_id,unit_price,vat_rate,excise_tax_rate)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[poId,line.sku_id,line.requested_quantity,line.uom_id,price.unitPrice,price.vatRate??10,price.exciseTaxRate??0]);
        await client.query(`INSERT INTO purchasing.purchase_order_delivery_schedule (
          purchase_order_line_id,schedule_number,promised_date,promised_quantity
        ) VALUES ($1,1,$2,$3)`,[inserted.rows[0]?.id,delivery.rows[0]?.date,line.requested_quantity]);
      }
      await client.query(`UPDATE purchasing.purchase_request SET status='CONVERTED',converted_po_id=$2,version=version+1,updated_at=now() WHERE id=$1`,[id,poId]);
      await this.audit(client,actorId,'CONVERT_TO_PO',request,request.warehouse_id,correlationId,undefined,{purchaseOrderId:poId});
      await client.query(`INSERT INTO platform.outbox_event (aggregate_type,aggregate_id,event_type,payload,correlation_id)
        VALUES ('PURCHASE_REQUEST',$1,'PURCHASE_REQUEST_CONVERTED',$2::jsonb,$3)`,[id,JSON.stringify({purchaseRequestId:id,purchaseOrderId:poId}),correlationId]);
      return {purchaseRequestId:id,purchaseOrderId:poId,status:'CONVERTED',replayed:false};
    });
  }

  private state(row:PurchaseRequestRow,status:string,version:number){
    if(row.status!==status) throw new ConflictException(`Purchase request must be ${status}`);
    if(Number(row.version)!==version) throw new ConflictException('VERSION_CONFLICT');
  }
  private async lock(client:import('pg').PoolClient,id:string){
    const rows=await client.query<PurchaseRequestRow>('SELECT * FROM purchasing.purchase_request WHERE id=$1 FOR UPDATE',[id]);
    if(!rows.rows[0]) throw new NotFoundException('Purchase request not found'); return rows.rows[0];
  }
  private async permissions(client:import('pg').PoolClient,actorId:string){
    const rows=await client.query<{code:string}>(`SELECT permission.code FROM iam.app_user user_account
      JOIN iam.role_permission grant_record ON grant_record.role_id=user_account.role_id
      JOIN iam.permission permission ON permission.id=grant_record.permission_id AND permission.status='ACTIVE'
      WHERE user_account.id=$1`,[actorId]); return rows.rows.map((row)=>row.code);
  }
  private async load(client:import('pg').PoolClient,row:PurchaseRequestRow){
    const lines=await client.query<{id:string;line_number:number;sku_id:string;requested_quantity:string;uom_id:string;suggested_supplier_id:string|null;estimated_delivery_date:string|null;note:string|null}>(
      'SELECT * FROM purchasing.purchase_request_line WHERE purchase_request_id=$1 ORDER BY line_number',[row.id]);
    return {id:row.id,prCode:row.pr_code,warehouseId:row.warehouse_id,supplierId:row.supplier_id,status:row.status,reason:row.reason,
      requiredByDate:row.required_by_date,requestedBy:row.requested_by,submittedAt:row.submitted_at,approvedBy:row.approved_by,
      approvedAt:row.approved_at,decisionReason:row.decision_reason,convertedPoId:row.converted_po_id,version:Number(row.version),
      correlationId:row.correlation_id,createdAt:row.created_at,lines:lines.rows.map((line)=>({id:line.id,lineNumber:Number(line.line_number),skuId:line.sku_id,
        quantity:Number(line.requested_quantity),uomId:line.uom_id,suggestedSupplierId:line.suggested_supplier_id,
        estimatedDeliveryDate:line.estimated_delivery_date,note:line.note}))};
  }
  private audit(client:import('pg').PoolClient,actorId:string,action:string,row:PurchaseRequestRow,warehouseId:string,correlationId:string,reason?:string,b?:unknown){
    return client.query(`INSERT INTO audit.audit_event (actor_id,action,resource_type,resource_id,warehouse_id,correlation_id,reason,before_data,after_data)
      VALUES ($1,$2,'PURCHASE_REQUEST',$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[actorId,action,row.id,warehouseId,correlationId,reason??null,
        JSON.stringify({status:row.status,version:Number(row.version)}),JSON.stringify(b??{})]);
  }
}
