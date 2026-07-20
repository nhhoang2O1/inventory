import { createHash } from 'node:crypto';
import { ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { ApprovalPolicyService } from '../../approval/public/approval-policy.service.js';
import { PurchasingDatabaseService } from './purchasing-database.service.js';

export interface PurchaseOrderLineInput{skuId:string;orderedQty:number;uomId:string;unitPrice:number;vatRate?:number;exciseTaxRate?:number;promisedDate?:string;}
export interface CreatePurchaseOrderInput{poCode:string;supplierId:string;warehouseId:string;businessCalendarId?:string;orderDate?:string;receivingTolerancePercent?:number;lines:PurchaseOrderLineInput[];}
interface PoRow{id:string;po_code:string;supplier_id:string;warehouse_id:string|null;business_calendar_id:string|null;status:string;order_date:string;expected_delivery_date:string;created_by:string;version:number;receiving_tolerance_percent:string;request_hash:string|null;idempotency_key:string|null;}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function whole(value:number,name:string){if(!Number.isSafeInteger(value)||value<=0)throw new ConflictException(`${name} must be a positive whole-case quantity`);return value;}
function date(value:string|undefined,name:string){if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))))throw new ConflictException(`${name} must be YYYY-MM-DD`);return value;}

@Injectable()
export class PurchaseOrderService{
  constructor(private readonly db:PurchasingDatabaseService,private readonly approval:ApprovalPolicyService){}

  async create(actorId:string,input:CreatePurchaseOrderInput,idempotencyKey:string,correlationId:string){
    const normalized={...input,poCode:input.poCode.trim().toUpperCase(),orderDate:date(input.orderDate,'orderDate'),
      receivingTolerancePercent:input.receivingTolerancePercent??2,lines:input.lines?.map((line)=>({...line,orderedQty:whole(line.orderedQty,'orderedQty'),promisedDate:date(line.promisedDate,'promisedDate')}))??[]};
    if(!normalized.poCode||normalized.lines.length===0)throw new ConflictException('PO code and at least one line are required');
    if(normalized.receivingTolerancePercent<0||normalized.receivingTolerancePercent>10)throw new ConflictException('Receiving tolerance must be between 0 and 10 percent');
    if(new Set(normalized.lines.map((line)=>line.skuId)).size!==normalized.lines.length)throw new ConflictException('A SKU can appear only once in a purchase order');
    const requestHash=digest(normalized);
    try{return await this.db.transaction(async(client)=>{
      if(!await this.db.hasAccess(actorId,'PURCHASING.PO_CREATE',input.warehouseId,client))throw new ForbiddenException('PURCHASING.PO_CREATE is required for the warehouse scope');
      const replay=await client.query<PoRow>('SELECT * FROM purchasing.purchase_order WHERE created_by=$1 AND idempotency_key=$2',[actorId,idempotencyKey]);
      if(replay.rows[0]){if(replay.rows[0].request_hash!==requestHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return{...(await this.load(client,replay.rows[0])),replayed:true};}
      const suppliers=await client.query<{business_calendar_id:string|null;standard_lead_time_days:number}>(`SELECT business_calendar_id,standard_lead_time_days FROM purchasing.supplier WHERE id=$1 AND status='ACTIVE'`,[input.supplierId]);
      const supplier=suppliers.rows[0];if(!supplier)throw new NotFoundException('Active supplier not found');
      const calendarId=input.businessCalendarId??supplier.business_calendar_id;
      const orderDate=normalized.orderDate??new Date().toISOString().slice(0,10);
      const estimated=await client.query<{delivery:string}>(`SELECT to_char(purchasing.add_working_days($1,$2,$3),'YYYY-MM-DD') AS delivery`,[calendarId,orderDate,supplier.standard_lead_time_days]);
      const delivery=estimated.rows[0]?.delivery;if(!delivery)throw new Error('Failed to calculate expected delivery date');
      const inserted=await client.query<PoRow>(`INSERT INTO purchasing.purchase_order
        (po_code,supplier_id,warehouse_id,business_calendar_id,status,order_date,expected_delivery_date,receiving_tolerance_percent,created_by,idempotency_key,request_hash,correlation_id)
        VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[normalized.poCode,input.supplierId,input.warehouseId,calendarId,orderDate,delivery,
        normalized.receivingTolerancePercent,actorId,idempotencyKey,requestHash,correlationId]);
      const po=inserted.rows[0];if(!po)throw new Error('Failed to create purchase order');
      for(const [index,line]of normalized.lines.entries()){
        if(line.unitPrice<0)throw new ConflictException('Unit price must be non-negative');
        const refs=await client.query<{sku:boolean;uom:boolean}>(`SELECT EXISTS(SELECT 1 FROM catalog.sku WHERE id=$1 AND status='ACTIVE') sku,
          EXISTS(SELECT 1 FROM catalog.unit_of_measure WHERE id=$2 AND whole_case_only) uom`,[line.skuId,line.uomId]);
        if(!refs.rows[0]?.sku||!refs.rows[0]?.uom)throw new NotFoundException('Active SKU or whole-case UOM not found');
        const poLine=await client.query<{id:string}>(`INSERT INTO purchasing.purchase_order_line
          (po_id,sku_id,ordered_qty,uom_id,unit_price,vat_rate,excise_tax_rate) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [po.id,line.skuId,line.orderedQty,line.uomId,line.unitPrice,line.vatRate??10,line.exciseTaxRate??0]);
        await client.query(`INSERT INTO purchasing.purchase_order_delivery_schedule
          (purchase_order_line_id,schedule_number,promised_date,promised_quantity) VALUES ($1,$2,$3,$4)`,[poLine.rows[0]?.id,index+1,line.promisedDate??delivery,line.orderedQty]);
      }
      await this.audit(client,actorId,'CREATE',po,input.warehouseId,correlationId,undefined,{status:'DRAFT',lineCount:normalized.lines.length});
      return{...(await this.load(client,po)),replayed:false};
    });}catch(error){if(error instanceof Error&&error.message.includes('unique constraint'))throw new ConflictException('Purchase order code already exists');throw error;}
  }

  async findOne(actorId:string,id:string){const rows=await this.db.query<PoRow>('SELECT * FROM purchasing.purchase_order WHERE id=$1',[id]);const po=rows[0];if(!po)throw new NotFoundException('Purchase order not found');
    if(!po.warehouse_id||!await this.db.hasAccess(actorId,'PURCHASING.VIEW',po.warehouse_id))throw new ForbiddenException('PURCHASING.VIEW is required');return this.db.transaction((client)=>this.load(client,po));}

  async findAll(actorId:string,warehouseId?:string){
    if(warehouseId&&!await this.db.hasAccess(actorId,'PURCHASING.VIEW',warehouseId))throw new ForbiddenException('PURCHASING.VIEW is required');
    return this.db.query(`SELECT DISTINCT po.id,po.po_code,po.supplier_id,po.warehouse_id,po.status,po.order_date,
      po.expected_delivery_date,po.version,po.created_by,supplier.code supplier_code,supplier.name supplier_name
      FROM purchasing.purchase_order po
      JOIN purchasing.supplier supplier ON supplier.id=po.supplier_id
      JOIN iam.user_warehouse_scope scope ON scope.user_id=$1 AND scope.warehouse_id=po.warehouse_id
        AND scope.revoked_at IS NULL AND scope.valid_from<=now() AND(scope.valid_until IS NULL OR scope.valid_until>now())
      JOIN iam.app_user user_account ON user_account.id=$1 AND user_account.status='ACTIVE'
      JOIN iam.role_permission grant_record ON grant_record.role_id=user_account.role_id
      JOIN iam.permission permission ON permission.id=grant_record.permission_id
        AND permission.code='PURCHASING.VIEW' AND permission.status='ACTIVE'
      WHERE($2::uuid IS NULL OR po.warehouse_id=$2)
      ORDER BY po.order_date DESC,po.po_code`,[actorId,warehouseId??null]);
  }

  async submit(actorId:string,id:string,expectedVersion:number,correlationId:string){return this.db.transaction(async(client)=>{const po=await this.lock(client,id);
    if(!po.warehouse_id||!await this.db.hasAccess(actorId,'PURCHASING.PO_CREATE',po.warehouse_id,client))throw new ForbiddenException('PURCHASING.PO_CREATE is required');
    if(po.created_by!==actorId)throw new ForbiddenException('Only the creator can submit this purchase order');this.state(po,'DRAFT',expectedVersion);
    const lines=await client.query<{sku_id:string;ordered_qty:string}>(`SELECT sku_id,ordered_qty FROM purchasing.purchase_order_line WHERE po_id=$1`,[id]);
    for(const line of lines.rows){const policy=await client.query<{minimum_quantity:string}>(`SELECT minimum_quantity FROM catalog.wholesale_quantity_policy WHERE sku_id=$1 AND direction='INBOUND'
      AND (supplier_id IS NULL OR supplier_id=$2) AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY (supplier_id IS NOT NULL) DESC,valid_from DESC LIMIT 1`,[line.sku_id,po.supplier_id]);
      if(policy.rows[0]&&Number(line.ordered_qty)<Number(policy.rows[0].minimum_quantity))throw new ConflictException(`MINIMUM_QUANTITY_NOT_MET:${line.sku_id}:${policy.rows[0].minimum_quantity}`);}
    const updated=await client.query<PoRow>(`UPDATE purchasing.purchase_order SET status='PENDING_APPROVAL',submitted_at=now(),version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id]);
    await this.audit(client,actorId,'SUBMIT',po,po.warehouse_id,correlationId,undefined,{status:'PENDING_APPROVAL'});return this.load(client,updated.rows[0]!);});}

  async approve(actorId:string,id:string,expectedVersion:number,correlationId:string,reason?:string){return this.db.transaction(async(client)=>{const po=await this.lock(client,id);
    if(!po.warehouse_id||!await this.db.hasAccess(actorId,'PURCHASING.PO_APPROVE',po.warehouse_id,client))throw new ForbiddenException('PURCHASING.PO_APPROVE is required');this.state(po,'PENDING_APPROVAL',expectedVersion);
    const permissions=await this.permissions(client,actorId);const check=this.approval.canDecide({status:'PENDING',creatorId:po.created_by,actorId,fourEyesRequired:true,currentLevel:1,decisionLevel:1,
      requiredPermission:'PURCHASING.PO_APPROVE',actorPermissions:permissions});if(!check.allowed)throw new ConflictException(check.code);
    const updated=await client.query<PoRow>(`UPDATE purchasing.purchase_order SET status='APPROVED',approved_by=$2,approved_at=now(),decision_reason=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,actorId,reason?.trim()||null]);
    await this.audit(client,actorId,'APPROVE',po,po.warehouse_id,correlationId,reason,{status:'APPROVED'});return this.load(client,updated.rows[0]!);});}

  async send(actorId:string,id:string,expectedVersion:number,correlationId:string){return this.db.transaction(async(client)=>{const po=await this.lock(client,id);
    if(!po.warehouse_id||!await this.db.hasAccess(actorId,'PURCHASING.PO_SEND',po.warehouse_id,client))throw new ForbiddenException('PURCHASING.PO_SEND is required');this.state(po,'APPROVED',expectedVersion);
    const supplier=await client.query<{standard_lead_time_days:number}>('SELECT standard_lead_time_days FROM purchasing.supplier WHERE id=$1',[po.supplier_id]);
    const delivery=await client.query<{date:string}>(`SELECT to_char(purchasing.add_working_days($1,current_date,$2),'YYYY-MM-DD') date`,[po.business_calendar_id,supplier.rows[0]?.standard_lead_time_days??0]);
    await client.query(`UPDATE purchasing.purchase_order_delivery_schedule schedule SET promised_date=$2,updated_at=now() FROM purchasing.purchase_order_line line
      WHERE schedule.purchase_order_line_id=line.id AND line.po_id=$1 AND schedule.status='OPEN'`,[id,delivery.rows[0]?.date]);
    const updated=await client.query<PoRow>(`UPDATE purchasing.purchase_order SET status='SENT',expected_delivery_date=$2,sent_by=$3,sent_at=now(),version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,delivery.rows[0]?.date,actorId]);
    await this.audit(client,actorId,'SEND',po,po.warehouse_id,correlationId,undefined,{status:'SENT',expectedDeliveryDate:delivery.rows[0]?.date});
    await client.query(`INSERT INTO platform.outbox_event(aggregate_type,aggregate_id,event_type,payload,correlation_id) VALUES('PURCHASE_ORDER',$1,'PURCHASE_ORDER_SENT',$2::jsonb,$3)`,[id,JSON.stringify({purchaseOrderId:id}),correlationId]);return this.load(client,updated.rows[0]!);});}

  async close(actorId:string,id:string,expectedVersion:number,reason:string,correlationId:string){if(!reason.trim())throw new ConflictException('Close reason is required');return this.db.transaction(async(client)=>{const po=await this.lock(client,id);
    if(!po.warehouse_id||!await this.db.hasAccess(actorId,'PURCHASING.PO_CLOSE',po.warehouse_id,client))throw new ForbiddenException('PURCHASING.PO_CLOSE is required');if(Number(po.version)!==expectedVersion)throw new ConflictException('VERSION_CONFLICT');
    if(!['APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED'].includes(po.status))throw new ConflictException(`Cannot close PO in ${po.status} status`);
    await client.query(`UPDATE purchasing.purchase_order_delivery_schedule schedule SET status='CANCELLED',updated_at=now() FROM purchasing.purchase_order_line line
      WHERE schedule.purchase_order_line_id=line.id AND line.po_id=$1 AND schedule.status IN('OPEN','PARTIALLY_RECEIVED')`,[id]);
    const updated=await client.query<PoRow>(`UPDATE purchasing.purchase_order SET status='CLOSED',closed_by=$2,closed_at=now(),close_reason=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,actorId,reason.trim()]);
    await this.audit(client,actorId,'CLOSE',po,po.warehouse_id,correlationId,reason,{status:'CLOSED'});return this.load(client,updated.rows[0]!);});}

  private state(po:PoRow,status:string,version:number){if(po.status!==status)throw new ConflictException(`Purchase order must be ${status}`);if(Number(po.version)!==version)throw new ConflictException('VERSION_CONFLICT');}
  private async lock(client:import('pg').PoolClient,id:string){const rows=await client.query<PoRow>('SELECT * FROM purchasing.purchase_order WHERE id=$1 FOR UPDATE',[id]);if(!rows.rows[0])throw new NotFoundException('Purchase order not found');return rows.rows[0];}
  private async permissions(client:import('pg').PoolClient,actorId:string){const rows=await client.query<{code:string}>(`SELECT permission.code FROM iam.app_user user_account JOIN iam.role_permission grant_record ON grant_record.role_id=user_account.role_id
    JOIN iam.permission permission ON permission.id=grant_record.permission_id AND permission.status='ACTIVE' WHERE user_account.id=$1`,[actorId]);return rows.rows.map((row)=>row.code);}
  private async load(client:import('pg').PoolClient,po:PoRow){const lines=await client.query<{id:string;skuId:string;orderedQty:string;receivedQty:string;uomId:string;unitPrice:string;vatRate:string;exciseTaxRate:string;schedules:Array<{id:string;scheduleNumber:number;promisedDate:string;promisedQuantity:number;acceptedQuantity:number;status:string}>}>(`SELECT line.id,line.sku_id AS "skuId",line.ordered_qty AS "orderedQty",line.received_qty AS "receivedQty",line.uom_id AS "uomId",line.unit_price AS "unitPrice",
    line.vat_rate AS "vatRate",line.excise_tax_rate AS "exciseTaxRate",COALESCE(jsonb_agg(jsonb_build_object('id',schedule.id,'scheduleNumber',schedule.schedule_number,'promisedDate',schedule.promised_date,
    'promisedQuantity',schedule.promised_quantity,'acceptedQuantity',schedule.accepted_quantity,'status',schedule.status) ORDER BY schedule.schedule_number) FILTER(WHERE schedule.id IS NOT NULL),'[]') schedules
    FROM purchasing.purchase_order_line line LEFT JOIN purchasing.purchase_order_delivery_schedule schedule ON schedule.purchase_order_line_id=line.id WHERE line.po_id=$1 GROUP BY line.id ORDER BY line.id`,[po.id]);
    return{id:po.id,poCode:po.po_code,supplierId:po.supplier_id,warehouseId:po.warehouse_id,businessCalendarId:po.business_calendar_id,status:po.status,orderDate:po.order_date,
      expectedDeliveryDate:po.expected_delivery_date,createdBy:po.created_by,version:Number(po.version),receivingTolerancePercent:Number(po.receiving_tolerance_percent),lines:lines.rows.map((line)=>({...line,
        orderedQty:Number(line.orderedQty),receivedQty:Number(line.receivedQty),unitPrice:Number(line.unitPrice),vatRate:Number(line.vatRate),exciseTaxRate:Number(line.exciseTaxRate),
        schedules:line.schedules.map((schedule)=>({...schedule,promisedQuantity:Number(schedule.promisedQuantity),acceptedQuantity:Number(schedule.acceptedQuantity)}))}))};}
  private audit(client:import('pg').PoolClient,actorId:string,action:string,po:PoRow,warehouseId:string,correlationId:string,reason?:string,after?:unknown){return client.query(`INSERT INTO audit.audit_event
    (actor_id,action,resource_type,resource_id,warehouse_id,correlation_id,reason,before_data,after_data) VALUES($1,$2,'PURCHASE_ORDER',$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[actorId,action,po.id,warehouseId,correlationId,reason??null,
      JSON.stringify({status:po.status,version:Number(po.version)}),JSON.stringify(after??{})]);}
}
