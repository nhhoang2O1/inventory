import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { InventoryDatabaseService } from './inventory-database.service.js';

export interface PostingLineInput {
  skuId: string; batchId: string; quantity: number; reservationId?: string;
  source?: { warehouseId: string; locationId: string; status: string };
  destination?: { warehouseId: string; locationId: string; status: string };
}

@Injectable()
export class InventoryApplicationService {
  constructor(private readonly db: InventoryDatabaseService) {}

  async atp(actorId: string, skuId: string, warehouseId: string) {
    await this.authorize(actorId, 'INVENTORY.VIEW', warehouseId);
    const rows=await this.db.query<{sellable_on_hand:string;active_reservation:string;atp:string}>(
      'SELECT sellable_on_hand,active_reservation,atp FROM inventory.atp_by_sku_warehouse WHERE sku_id=$1 AND warehouse_id=$2',[skuId,warehouseId]);
    const row=rows[0]??{sellable_on_hand:'0',active_reservation:'0',atp:'0'};
    return {skuId,warehouseId,sellableOnHand:Number(row.sellable_on_hand),activeReservation:Number(row.active_reservation),atp:Number(row.atp)};
  }

  async balances(actorId:string,warehouseId:string,skuId?:string){
    await this.authorize(actorId,'INVENTORY.VIEW',warehouseId);
    return this.db.query('SELECT sku_id,batch_id,location_id,stock_status,quantity_on_hand,version FROM inventory.inventory_balance WHERE warehouse_id=$1 AND ($2::uuid IS NULL OR sku_id=$2) ORDER BY sku_id,batch_id,location_id,stock_status',[warehouseId,skuId??null]);
  }
  async reservations(actorId:string,warehouseId:string,skuId?:string){
    await this.authorize(actorId,'INVENTORY.VIEW',warehouseId);
    return this.db.query('SELECT id,demand_type,demand_id,sku_id,batch_id,location_id,quantity_reserved,quantity_fulfilled,quantity_released,status,expires_at,version FROM inventory.inventory_reservation WHERE warehouse_id=$1 AND ($2::uuid IS NULL OR sku_id=$2) ORDER BY created_at DESC',[warehouseId,skuId??null]);
  }
  async inTransit(actorId:string,warehouseId:string){
    await this.authorize(actorId,'INVENTORY.VIEW',warehouseId);
    return this.db.query("SELECT sku_id,batch_id,sum(quantity_on_hand)::bigint quantity_in_transit FROM inventory.inventory_balance WHERE warehouse_id=$1 AND stock_status='IN_TRANSIT' GROUP BY sku_id,batch_id",[warehouseId]);
  }
  async reconciliation(actorId:string,warehouseId:string){
    await this.authorize(actorId,'INVENTORY.RECONCILE',warehouseId);
    return this.db.query('SELECT sku_id,batch_id,location_id,stock_status,quantity_on_hand,ledger_quantity,variance FROM inventory.ledger_balance_reconciliation WHERE warehouse_id=$1 ORDER BY abs(variance) DESC',[warehouseId]);
  }
  async skus(actorId: string) {
    await this.authorizeGlobal(actorId,'CATALOG.VIEW');
    return this.db.query(`
      SELECT s.id, s.code, s.name, u.code as uom_code, ps.units_per_case as ratio
      FROM catalog.sku s
      LEFT JOIN catalog.unit_of_measure u ON u.id = s.base_uom_id
      LEFT JOIN catalog.packaging_specification ps ON ps.sku_id = s.id AND ps.valid_until IS NULL
      ORDER BY s.name ASC
    `);
  }
  async users(actorId: string) {
    await this.authorizeGlobal(actorId,'IAM.USER_VIEW');
    return this.db.query(`
      SELECT id, username, display_name
      FROM iam.app_user
      WHERE status = 'ACTIVE'
      ORDER BY username
    `);
  }
  async warehouses(actorId: string) {
    await this.authorizeGlobal(actorId,'WAREHOUSE.VIEW');
    return this.db.query(`
      SELECT DISTINCT warehouse.id,warehouse.code,warehouse.name,warehouse.status
      FROM warehouse.warehouse warehouse
      JOIN iam.user_warehouse_scope scope ON scope.warehouse_id=warehouse.id
      WHERE scope.user_id=$1 AND scope.revoked_at IS NULL AND scope.valid_from<=now()
        AND(scope.valid_until IS NULL OR scope.valid_until>now()) AND warehouse.status='ACTIVE'
      ORDER BY warehouse.code`,[actorId]);
  }
  async zones(actorId: string, warehouseId: string) {
    await this.authorize(actorId,'INVENTORY.VIEW',warehouseId);
    return this.db.query(`
      SELECT id, code, name
      FROM warehouse.zone
      WHERE warehouse_id = $1 AND status = 'ACTIVE'
      ORDER BY code ASC
    `, [warehouseId]);
  }
  async locations(actorId: string, warehouseId: string) {
    await this.authorize(actorId,'INVENTORY.VIEW',warehouseId);
    return this.db.query(`
      SELECT l.id, l.code, z.code as zone_code
      FROM warehouse.location l
      JOIN warehouse.zone z ON z.id = l.zone_id
      WHERE z.warehouse_id = $1 AND l.status = 'ACTIVE'
      ORDER BY z.code, l.code
    `, [warehouseId]);
  }
  async batches(actorId: string, skuId: string) {
    await this.authorizeGlobal(actorId,'CATALOG.VIEW');
    return this.db.query(`
      SELECT id, batch_code, manufacturing_date, expiration_date
      FROM inventory.batch
      WHERE sku_id = $1
      ORDER BY expiration_date ASC
    `, [skuId]);
  }
  async findOrCreateBatch(actorId: string, input: { warehouseId:string;skuId: string; batchCode: string; manufacturingDate: string; expirationDate: string }) {
    await this.authorize(actorId,'RECEIVING.CREATE',input.warehouseId);
    if(!input.batchCode.trim())throw new ConflictException('Batch code is required');
    if(Number.isNaN(Date.parse(input.manufacturingDate))||Number.isNaN(Date.parse(input.expirationDate))||
      new Date(input.manufacturingDate)>=new Date(input.expirationDate))throw new ConflictException('Manufacturing date must be before expiration date');
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM inventory.batch WHERE sku_id = $1 AND batch_code = $2',
      [input.skuId, input.batchCode.trim()]
    );
    if (existing.length > 0) {
      return existing[0];
    }
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO inventory.batch (sku_id, batch_code, manufacturing_date, expiration_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.skuId, input.batchCode.trim(), input.manufacturingDate, input.expirationDate]
    );
    return result[0];
  }

  async reserve(actorId:string,input:{demandType:string;demandId:string;skuId:string;warehouseId:string;quantity:number;expiresAt?:string},key:string){
    await this.authorize(actorId,'INVENTORY.RESERVE',input.warehouseId);
    try { const rows=await this.db.query<{id:string}>('SELECT inventory.reserve_inventory($1,$2,$3,$4,$5,$6,$7) id',
      [input.demandType,input.demandId,input.skuId,input.warehouseId,input.quantity,input.expiresAt??null,key]); return {reservationId:rows[0]?.id};
    } catch(error){this.mapConflict(error);}
  }

  async release(actorId:string,reservationId:string,quantity:number){
    const rows=await this.db.query<{warehouse_id:string}>('SELECT warehouse_id FROM inventory.inventory_reservation WHERE id=$1',[reservationId]);
    if(!rows[0]) throw new NotFoundException('Reservation not found');
    await this.authorize(actorId,'INVENTORY.RESERVE',rows[0].warehouse_id);
    await this.db.query('SELECT inventory.release_reservation($1,$2)',[reservationId,quantity]); return {reservationId,released:true};
  }

  async post(actorId:string,documentType:string,documentId:string,key:string,correlationId:string,reason:string|undefined,lines:readonly PostingLineInput[]){
    const warehouseId=lines[0]?.destination?.warehouseId??lines[0]?.source?.warehouseId;
    if(!warehouseId) throw new ConflictException('Posting requires source or destination');
    const warehouseIds=new Set(lines.flatMap(line=>[line.source?.warehouseId,line.destination?.warehouseId].filter((id):id is string=>Boolean(id))));
    for(const id of warehouseIds)await this.authorize(actorId,'INVENTORY.POST',id);
    try { return await this.db.transaction(async client=>{
      const movementIds:string[]=[];
      for(const [index,line] of lines.entries()){
        if(line.reservationId){if(!line.source)throw new ConflictException('Reservation fulfillment requires an issue source');await client.query('SELECT inventory.fulfill_reservation($1,$2,$3,$4)',[line.reservationId,line.skuId,line.source.warehouseId,line.quantity]);}
        const result=await this.postLine(client,actorId,documentType,documentId,`${key}:${index}`,correlationId,reason,line);
        movementIds.push(result);
      }
      return {documentId,movementIds,replayed:false};
    }); } catch(error){this.mapConflict(error);}
  }

  async reverse(actorId:string,movementId:string,documentId:string,key:string,correlationId:string,reason:string){
    const rows=await this.db.query<{sku_id:string;batch_id:string;quantity:string;source_warehouse_id:string|null;source_location_id:string|null;source_status:string|null;destination_warehouse_id:string|null;destination_location_id:string|null;destination_status:string|null}>(
      'SELECT sku_id,batch_id,quantity,source_warehouse_id,source_location_id,source_status,destination_warehouse_id,destination_location_id,destination_status FROM inventory.inventory_movement_ledger WHERE id=$1',[movementId]);
    const original=rows[0];if(!original)throw new NotFoundException('Movement not found');
    const warehouseId=original.destination_warehouse_id??original.source_warehouse_id;if(!warehouseId)throw new ConflictException('Original movement has no warehouse');
    await this.authorize(actorId,'INVENTORY.REVERSE',warehouseId);
    try{return await this.db.transaction(async client=>{
      const result=await client.query<{id:string}>('SELECT inventory.post_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) id',[
        'REVERSAL','REVERSAL',documentId,key,original.sku_id,original.batch_id,Number(original.quantity),
        original.destination_warehouse_id,original.destination_location_id,original.destination_status,
        original.source_warehouse_id,original.source_location_id,original.source_status,actorId,correlationId,reason,movementId]);
      return{movementId:result.rows[0]?.id,reversalOf:movementId};
    });}catch(error){this.mapConflict(error);}
  }

  async positions(actorId: string, warehouseId: string) {
    await this.authorize(actorId, 'INVENTORY.VIEW', warehouseId);
    return this.db.query(`
      SELECT p.sku_id, p.sku_code, p.sku_name, p.batch_id, p.batch_code, p.stock_status, p.quantity_on_hand, p.expiration_date, p.location_id, l.code as location_code
      FROM reporting.inventory_position p
      LEFT JOIN warehouse.location l ON l.id = p.location_id
      WHERE p.warehouse_id = $1
      ORDER BY p.sku_code, p.expiration_date ASC
    `, [warehouseId]);
  }

  private async postLine(client:PoolClient,actorId:string,documentType:string,documentId:string,key:string,correlationId:string,reason:string|undefined,line:PostingLineInput){
    const result=await client.query<{id:string}>('SELECT inventory.post_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) id',[
      line.source&&line.destination?'TRANSFER':line.source?'ISSUE':'RECEIPT',documentType,documentId,key,line.skuId,line.batchId,line.quantity,
      line.source?.warehouseId??null,line.source?.locationId??null,line.source?.status??null,line.destination?.warehouseId??null,line.destination?.locationId??null,line.destination?.status??null,
      actorId,correlationId,reason??null]);
    const id=result.rows[0]?.id;if(!id) throw new Error('Movement was not returned');return id;
  }

  private async authorize(actorId:string,permission:string,warehouseId:string){if(!await this.db.hasAccess(actorId,permission,warehouseId))throw new ForbiddenException('Permission or warehouse scope denied');}
  private async authorizeGlobal(actorId:string,permission:string){if(!await this.db.hasPermission(actorId,permission))throw new ForbiddenException('Permission denied');}
  private mapConflict(error:unknown):never {const message=error instanceof Error?error.message:'Inventory conflict';throw new ConflictException(message.includes('INVENTORY_')?message:'Inventory command conflict');}
}
