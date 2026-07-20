import { createHash } from 'node:crypto';
import { ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { ApprovalPolicyService } from '../../approval/public/approval-policy.service.js';
import { ReceivingDatabaseService } from './receiving-database.service.js';
export type ReceiptExceptionType='MRSL'|'OVER_RECEIPT'|'MINIMUM_QUANTITY'|'UNPLANNED_RECEIPT';
interface Row{id:string;exception_code:string;goods_receipt_id:string;goods_receipt_line_id:string|null;exception_type:ReceiptExceptionType;status:string;reason:string;evidence:unknown;requested_by:string;approved_by:string|null;decision_reason:string|null;warehouse_id:string;request_hash:string;version:number;}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
@Injectable()
export class ReceiptExceptionService{
  constructor(private readonly db:ReceivingDatabaseService,private readonly approval:ApprovalPolicyService){}
  async create(actorId:string,input:{exceptionCode:string;goodsReceiptId:string;goodsReceiptLineId?:string;exceptionType:ReceiptExceptionType;reason:string;evidence?:unknown},key:string,correlationId:string){
    const normalized={...input,exceptionCode:input.exceptionCode.trim().toUpperCase(),reason:input.reason.trim(),evidence:input.evidence??{}};if(!normalized.exceptionCode||!normalized.reason)throw new ConflictException('Exception code and reason are required');
    const requestHash=hash(normalized);return this.db.transaction(async(client)=>{
      const receipt=await client.query<{warehouse_id:string|null}>(`SELECT warehouse_id FROM receiving.goods_receipt WHERE id=$1`,[input.goodsReceiptId]);const warehouseId=receipt.rows[0]?.warehouse_id;if(!warehouseId)throw new NotFoundException('Warehouse-scoped goods receipt not found');
      if(!await this.db.hasAccess(actorId,'RECEIVING.EXCEPTION_REQUEST',warehouseId,client))throw new ForbiddenException('RECEIVING.EXCEPTION_REQUEST is required');
      const replay=await client.query<Row>(`SELECT exception.*,receipt.warehouse_id FROM receiving.receipt_exception_request exception JOIN receiving.goods_receipt receipt ON receipt.id=exception.goods_receipt_id WHERE exception.requested_by=$1 AND exception.idempotency_key=$2`,[actorId,key]);
      if(replay.rows[0]){if(replay.rows[0].request_hash!==requestHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return{...this.view(replay.rows[0]),replayed:true};}
      if(input.goodsReceiptLineId&&(await client.query('SELECT 1 FROM receiving.goods_receipt_line WHERE id=$1 AND gr_id=$2',[input.goodsReceiptLineId,input.goodsReceiptId])).rowCount===0)throw new ConflictException('Receipt line does not belong to goods receipt');
      if(input.exceptionType!=='UNPLANNED_RECEIPT'&&!input.goodsReceiptLineId)throw new ConflictException('goodsReceiptLineId is required for this exception type');
      const inserted=await client.query<Row>(`INSERT INTO receiving.receipt_exception_request
        (exception_code,goods_receipt_id,goods_receipt_line_id,exception_type,reason,evidence,requested_by,correlation_id,idempotency_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,[normalized.exceptionCode,input.goodsReceiptId,input.goodsReceiptLineId??null,input.exceptionType,normalized.reason,JSON.stringify(normalized.evidence),actorId,correlationId,key,requestHash]);
      const row={...inserted.rows[0]!,warehouse_id:warehouseId};await this.audit(client,actorId,'REQUEST',row,warehouseId,correlationId,normalized.reason,{status:'PENDING',type:input.exceptionType});return{...this.view(row),replayed:false};
    });
  }
  async decide(actorId:string,id:string,expectedVersion:number,decision:'APPROVED'|'REJECTED',reason:string,correlationId:string){if(decision==='REJECTED'&&!reason.trim())throw new ConflictException('Rejection reason is required');return this.db.transaction(async(client)=>{
    const result=await client.query<Row>(`SELECT exception.*,receipt.warehouse_id FROM receiving.receipt_exception_request exception JOIN receiving.goods_receipt receipt ON receipt.id=exception.goods_receipt_id WHERE exception.id=$1 FOR UPDATE OF exception`,[id]);const row=result.rows[0];if(!row)throw new NotFoundException('Receipt exception not found');
    if(!await this.db.hasAccess(actorId,'RECEIVING.EXCEPTION_APPROVE',row.warehouse_id,client))throw new ForbiddenException('RECEIVING.EXCEPTION_APPROVE is required');if(row.status!=='PENDING')throw new ConflictException('Receipt exception must be PENDING');if(Number(row.version)!==expectedVersion)throw new ConflictException('VERSION_CONFLICT');
    const permissions=await client.query<{code:string}>(`SELECT permission.code FROM iam.app_user user_account JOIN iam.role_permission grant_record ON grant_record.role_id=user_account.role_id JOIN iam.permission permission ON permission.id=grant_record.permission_id AND permission.status='ACTIVE' WHERE user_account.id=$1`,[actorId]);
    const check=this.approval.canDecide({status:'PENDING',creatorId:row.requested_by,actorId,fourEyesRequired:true,currentLevel:1,decisionLevel:1,requiredPermission:'RECEIVING.EXCEPTION_APPROVE',actorPermissions:permissions.rows.map((item)=>item.code)});if(!check.allowed)throw new ConflictException(check.code);
    const updated=await client.query<Row>(`UPDATE receiving.receipt_exception_request SET status=$2,approved_by=$3,approved_at=now(),decision_reason=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,decision,actorId,reason.trim()||null]);
    await this.audit(client,actorId,decision==='APPROVED'?'APPROVE':'REJECT',row,row.warehouse_id,correlationId,reason,{status:decision});return this.view({...updated.rows[0]!,warehouse_id:row.warehouse_id});});}
  async findOne(actorId:string,id:string){const rows=await this.db.query<Row>(`SELECT exception.*,receipt.warehouse_id FROM receiving.receipt_exception_request exception JOIN receiving.goods_receipt receipt ON receipt.id=exception.goods_receipt_id WHERE exception.id=$1`,[id]);const row=rows[0];if(!row)throw new NotFoundException('Receipt exception not found');if(!await this.db.hasAccess(actorId,'RECEIVING.VIEW',row.warehouse_id))throw new ForbiddenException('RECEIVING.VIEW is required');return this.view(row);}
  private view(row:Row){return{id:row.id,exceptionCode:row.exception_code,goodsReceiptId:row.goods_receipt_id,goodsReceiptLineId:row.goods_receipt_line_id,exceptionType:row.exception_type,status:row.status,reason:row.reason,evidence:row.evidence,requestedBy:row.requested_by,approvedBy:row.approved_by,decisionReason:row.decision_reason,version:Number(row.version)};}
  private audit(client:import('pg').PoolClient,actor:string,action:string,row:Row,warehouse:string,correlation:string,reason?:string,after?:unknown){return client.query(`INSERT INTO audit.audit_event(actor_id,action,resource_type,resource_id,warehouse_id,correlation_id,reason,before_data,after_data) VALUES($1,$2,'RECEIPT_EXCEPTION',$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[actor,action,row.id,warehouse,correlation,reason??null,JSON.stringify({status:row.status,version:Number(row.version)}),JSON.stringify(after??{})]);}
}
