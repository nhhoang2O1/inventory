import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { ConflictException } from '@nestjs/common';
import { ApprovalPolicyService } from '../apps/api/dist/modules/approval/public/approval-policy.service.js';
import { PurchasingDatabaseService } from '../apps/api/dist/modules/purchasing/public/purchasing-database.service.js';
import { BusinessCalendarService } from '../apps/api/dist/modules/purchasing/public/business-calendar.service.js';
import { SupplierService } from '../apps/api/dist/modules/purchasing/public/supplier.service.js';
import { PurchaseRequestService } from '../apps/api/dist/modules/purchasing/public/purchase-request.service.js';
import { PurchaseOrderService } from '../apps/api/dist/modules/purchasing/public/purchase-order.service.js';
import { ReceivingDatabaseService } from '../apps/api/dist/modules/receiving/public/receiving-database.service.js';
import { GoodsReceiptService } from '../apps/api/dist/modules/receiving/public/goods-receipt.service.js';
import { ReceiptExceptionService } from '../apps/api/dist/modules/receiving/public/receipt-exception.service.js';
const {Client}=pg;
const connectionString=process.env.DATABASE_URL||'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms';
const token=Date.now().toString(36).toUpperCase();
const correlation='a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const key=(name)=>`${name}-${token}-1234567890`;

test('Phase 5 completed UAT: calendar, PR/PO four-eyes, schedules, MRSL exception and partial receipts',async()=>{
  const client=new Client({connectionString});await client.connect();
  const purchasingDb=new PurchasingDatabaseService(),receivingDb=new ReceivingDatabaseService(),approval=new ApprovalPolicyService();
  const calendars=new BusinessCalendarService(purchasingDb),suppliers=new SupplierService(purchasingDb),requests=new PurchaseRequestService(purchasingDb,approval),orders=new PurchaseOrderService(purchasingDb,approval),receipts=new GoodsReceiptService(receivingDb),exceptions=new ReceiptExceptionService(receivingDb,approval);
  try{
    const roles=await Promise.all(['REQUESTER','APPROVER'].map(async suffix=>(await client.query(`INSERT INTO iam.role(code,name,is_system) VALUES($1,$1,true) RETURNING id`,[`P5_${suffix}_${token}`])).rows[0].id));
    const users=await Promise.all(roles.map(async(role,index)=>(await client.query(`INSERT INTO iam.app_user(username,display_name,role_id,password_hash) VALUES($1,$1,$2,'test') RETURNING id`,[`p5_${index}_${token.toLowerCase()}`,role])).rows[0].id));
    const permissions=['SUPPLIER.VIEW','SUPPLIER.MANAGE','PURCHASING.VIEW','PURCHASING.PR_CREATE','PURCHASING.PR_APPROVE','PURCHASING.PO_CREATE','PURCHASING.PO_APPROVE','PURCHASING.PO_SEND','PURCHASING.PO_CLOSE','PURCHASING.CALENDAR_MANAGE','RECEIVING.VIEW','RECEIVING.CREATE','RECEIVING.POST','RECEIVING.EXCEPTION_REQUEST','RECEIVING.EXCEPTION_APPROVE'];
    await client.query(`INSERT INTO iam.role_permission(role_id,permission_id) SELECT role.id,permission.id FROM iam.role role CROSS JOIN iam.permission permission WHERE role.id=ANY($1::uuid[]) AND permission.code=ANY($2::text[]) ON CONFLICT DO NOTHING`,[roles,permissions]);
    const warehouse=(await client.query(`INSERT INTO warehouse.warehouse(code,name) VALUES($1,$1) RETURNING id`,[`WHP5${token}`])).rows[0].id;
    await client.query(`INSERT INTO iam.user_warehouse_scope(user_id,warehouse_id,valid_from) SELECT unnest($1::uuid[]),$2,now()`,[users,warehouse]);
    const zone=(await client.query(`INSERT INTO warehouse.zone(warehouse_id,code,name,zone_type) VALUES($1,'RECV','Receiving','RECEIVING') RETURNING id`,[warehouse])).rows[0].id;
    const locations=[];for(const code of ['L1','L2'])locations.push((await client.query(`INSERT INTO warehouse.location(zone_id,code) VALUES($1,$2) RETURNING id`,[zone,code])).rows[0].id);
    const uom=(await client.query(`INSERT INTO catalog.unit_of_measure(code,name) VALUES('CASE','Case') ON CONFLICT(code)DO UPDATE SET name=excluded.name RETURNING id`)).rows[0].id;
    const category=(await client.query(`INSERT INTO catalog.category(code,name) VALUES($1,$1) RETURNING id`,[`CP5${token}`])).rows[0].id;
    const product=(await client.query(`INSERT INTO catalog.product(code,name,category_id) VALUES($1,$1,$2) RETURNING id`,[`PP5${token}`,category])).rows[0].id;
    const sku=(await client.query(`INSERT INTO catalog.sku(product_id,code,name,base_uom_id) VALUES($1,$2,$2,$3) RETURNING id`,[product,`SP5${token}`,uom])).rows[0].id;
    const calendar=await calendars.create(users[0],{code:`CAL${token}`,name:'Vietnam working week',weekendDays:[0,6]},correlation);
    const supplier=await suppliers.create(users[0],{code:`SUP${token}`,name:'Phase 5 Supplier',standardLeadTimeDays:4,businessCalendarId:calendar.id},correlation);
    const order=await orders.create(users[0],{poCode:`PO${token}`,supplierId:supplier.id,warehouseId:warehouse,businessCalendarId:calendar.id,orderDate:'2026-07-17',receivingTolerancePercent:2,lines:[{skuId:sku,orderedQty:100,uomId:uom,unitPrice:25000}]},key('po-create'),correlation);
    assert.equal(new Date(order.expectedDeliveryDate).toISOString().slice(0,10),'2026-07-23');
    const submitted=await orders.submit(users[0],order.id,1,correlation);await assert.rejects(()=>orders.approve(users[0],order.id,submitted.version,correlation),ConflictException);
    const approved=await orders.approve(users[1],order.id,submitted.version,correlation,'Budget approved');const sent=await orders.send(users[0],order.id,approved.version,correlation);assert.equal(sent.status,'SENT');assert.equal(sent.lines[0].schedules.length,1);
    const request=await requests.create(users[0],{prCode:`PR${token}`,warehouseId:warehouse,supplierId:supplier.id,reason:'Replenishment',lines:[{skuId:sku,quantity:24,uomId:uom}]},key('pr-create'),correlation);
    const requestSubmitted=await requests.submit(users[0],request.id,1,correlation);await assert.rejects(()=>requests.decide(users[0],request.id,requestSubmitted.version,'APPROVED','',correlation),ConflictException);
    const requestApproved=await requests.decide(users[1],request.id,requestSubmitted.version,'APPROVED','Approved',correlation);assert.equal(requestApproved.status,'APPROVED');
    const conversionInput={poCode:`POPR${token}`,supplierId:supplier.id,businessCalendarId:calendar.id,prices:[{prLineId:requestApproved.lines[0].id,unitPrice:26000}]};
    const converted=await requests.convert(users[0],request.id,requestApproved.version,conversionInput,key('pr-convert'),correlation);assert.ok(converted.purchaseOrderId);
    const convertedReplay=await requests.convert(users[0],request.id,requestApproved.version,conversionInput,key('pr-convert'),correlation);assert.equal(convertedReplay.replayed,true);
    const batches=[];for(const [index,expiry]of ['2026-08-15','2026-08-20'].entries())batches.push((await client.query(`INSERT INTO inventory.batch(sku_id,batch_code,manufacturing_date,expiration_date) VALUES($1,$2,'2026-01-01',$3) RETURNING id`,[sku,`BP5${index}${token}`,expiry])).rows[0].id);
    await client.query(`INSERT INTO receiving.mrsl_policy(sku_id,min_remaining_days,exception_mode,valid_from) VALUES($1,200,'ALLOW_WITH_APPROVAL','2026-01-01')`,[sku]);
    const receipt=await receipts.create(users[0],{grCode:`GR1${token}`,poId:order.id,warehouseId:warehouse,receivedDate:'2026-07-20T00:00:00Z',lines:[
      {poLineId:sent.lines[0].id,skuId:sku,batchId:batches[0],quantity:30,uomId:uom,locationId:locations[0],stockStatus:'AVAILABLE'},
      {poLineId:sent.lines[0].id,skuId:sku,batchId:batches[1],quantity:30,uomId:uom,locationId:locations[1],stockStatus:'AVAILABLE'}]},key('gr-create'),correlation);
    const replay=await receipts.create(users[0],{grCode:`GR1${token}`,poId:order.id,warehouseId:warehouse,receivedDate:'2026-07-20T00:00:00Z',lines:[
      {poLineId:sent.lines[0].id,skuId:sku,batchId:batches[0],quantity:30,uomId:uom,locationId:locations[0],stockStatus:'AVAILABLE'},
      {poLineId:sent.lines[0].id,skuId:sku,batchId:batches[1],quantity:30,uomId:uom,locationId:locations[1],stockStatus:'AVAILABLE'}]},key('gr-create'),correlation);assert.equal(replay.replayed,true);
    const confirmed=await receipts.confirm(users[0],receipt.id,1,correlation);await assert.rejects(()=>receipts.post(users[0],receipt.id,confirmed.version,key('gr-post'),correlation),/MRSL_APPROVAL_REQUIRED/);
    for(const [index,line]of confirmed.lines.entries()){const exception=await exceptions.create(users[0],{exceptionCode:`EX${index}${token}`,goodsReceiptId:receipt.id,goodsReceiptLineId:line.id,exceptionType:'MRSL',reason:'Supplier-approved short shelf life'},key(`ex-${index}`),correlation);
      await assert.rejects(()=>exceptions.decide(users[0],exception.id,1,'APPROVED','',correlation),ConflictException);await exceptions.decide(users[1],exception.id,1,'APPROVED','Approved for promotion',correlation);}
    const posted=await receipts.post(users[0],receipt.id,confirmed.version,key('gr-post'),correlation,'Inbound delivery');assert.equal(posted.movementIds.length,2);assert.equal(posted.purchaseOrderStatus,'PARTIALLY_RECEIVED');
    const postReplay=await receipts.post(users[0],receipt.id,confirmed.version,key('gr-post'),correlation,'Inbound delivery');assert.equal(postReplay.replayed,true);
    const quantity=await client.query(`SELECT sum(quantity_on_hand)::bigint quantity FROM inventory.inventory_balance WHERE sku_id=$1 AND warehouse_id=$2`,[sku,warehouse]);assert.equal(Number(quantity.rows[0].quantity),60);
    const schedule=await client.query(`SELECT accepted_quantity,status FROM purchasing.purchase_order_delivery_schedule WHERE purchase_order_line_id=$1`,[sent.lines[0].id]);assert.equal(Number(schedule.rows[0].accepted_quantity),60);assert.equal(schedule.rows[0].status,'PARTIALLY_RECEIVED');
  }finally{await client.end();await purchasingDb.onModuleDestroy();await receivingDb.onModuleDestroy();}
});
