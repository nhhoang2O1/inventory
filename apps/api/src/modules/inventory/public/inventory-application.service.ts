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
    await this.authorize(actorId,'INVENTORY.POST',warehouseId);
    try { return await this.db.transaction(async client=>{
      const movementIds:string[]=[];
      for(const [index,line] of lines.entries()){
        const result=await this.postLine(client,actorId,documentType,documentId,`${key}:${index}`,correlationId,reason,line);
        movementIds.push(result);
        if(line.reservationId) await client.query('SELECT inventory.fulfill_reservation($1,$2)',[line.reservationId,line.quantity]);
      }
      return {documentId,movementIds,replayed:false};
    }); } catch(error){this.mapConflict(error);}
  }

  private async postLine(client:PoolClient,actorId:string,documentType:string,documentId:string,key:string,correlationId:string,reason:string|undefined,line:PostingLineInput){
    const result=await client.query<{id:string}>('SELECT inventory.post_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) id',[
      line.source&&line.destination?'TRANSFER':line.source?'ISSUE':'RECEIPT',documentType,documentId,key,line.skuId,line.batchId,line.quantity,
      line.source?.warehouseId??null,line.source?.locationId??null,line.source?.status??null,line.destination?.warehouseId??null,line.destination?.locationId??null,line.destination?.status??null,
      actorId,correlationId,reason??null]);
    const id=result.rows[0]?.id;if(!id) throw new Error('Movement was not returned');return id;
  }

  private async authorize(actorId:string,permission:string,warehouseId:string){if(!await this.db.hasAccess(actorId,permission,warehouseId))throw new ForbiddenException('Permission or warehouse scope denied');}
  private mapConflict(error:unknown):never {const message=error instanceof Error?error.message:'Inventory conflict';throw new ConflictException(message.includes('INVENTORY_')?message:'Inventory command conflict');}
}
