$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$envLine = Get-Content '.env' | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
$env:DATABASE_URL = $envLine.Substring(13)
$env:API_PORT = '3100'
$logOut = Join-Path $env:TEMP 'wms-phase4-api.out.log'
$logErr = Join-Path $env:TEMP 'wms-phase4-api.err.log'

$seed = @"
INSERT INTO catalog.unit_of_measure(id,code,name) VALUES('40000000-0000-4000-8000-000000000001','CASE','Case');
INSERT INTO catalog.product(id,code,name) VALUES('40000000-0000-4000-8000-000000000002','P_API','API Product');
INSERT INTO catalog.sku(id,product_id,code,name,base_uom_id) VALUES('40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','SKU_API','API SKU','40000000-0000-4000-8000-000000000001');
INSERT INTO warehouse.warehouse(id,code,name) VALUES('40000000-0000-4000-8000-000000000004','W_API','API Warehouse');
INSERT INTO warehouse.zone(id,warehouse_id,code,name) VALUES('40000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000004','Z_API','API Zone');
INSERT INTO warehouse.location(id,zone_id,code) VALUES('40000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000005','L_API');
INSERT INTO iam.role(id,code,name) VALUES('40000000-0000-4000-8000-000000000007','API_TEST','API Test');
INSERT INTO iam.permission(id,code,name) VALUES('40000000-0000-4000-8000-000000000008','INVENTORY.VIEW','View'),('40000000-0000-4000-8000-000000000009','INVENTORY.RESERVE','Reserve'),('40000000-0000-4000-8000-000000000010','INVENTORY.POST','Post');
INSERT INTO iam.role_permission(role_id,permission_id) SELECT '40000000-0000-4000-8000-000000000007',id FROM iam.permission WHERE id IN ('40000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000010');
INSERT INTO iam.app_user(id,username,display_name,role_id,password_hash) VALUES('40000000-0000-4000-8000-000000000011','api.test','API Test','40000000-0000-4000-8000-000000000007','hash');
INSERT INTO iam.user_warehouse_scope(user_id,warehouse_id) VALUES('40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000004');
INSERT INTO inventory.batch(id,sku_id,batch_code,manufacturing_date,expiration_date) VALUES('40000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000000003','API-B1','2026-01-01','2027-01-01');
"@

$cleanup = @"
BEGIN; SET LOCAL session_replication_role=replica;
DELETE FROM inventory.inventory_reservation WHERE sku_id='40000000-0000-4000-8000-000000000003';
DELETE FROM platform.outbox_event WHERE aggregate_id IN (SELECT id FROM inventory.inventory_movement_ledger WHERE document_id='40000000-0000-4000-8000-000000000013');
DELETE FROM audit.audit_event WHERE actor_id='40000000-0000-4000-8000-000000000011';
DELETE FROM inventory.inventory_movement_ledger WHERE document_id='40000000-0000-4000-8000-000000000013';
DELETE FROM inventory.inventory_balance WHERE sku_id='40000000-0000-4000-8000-000000000003';
DELETE FROM inventory.batch WHERE sku_id='40000000-0000-4000-8000-000000000003';
DELETE FROM iam.user_warehouse_scope WHERE user_id='40000000-0000-4000-8000-000000000011';
DELETE FROM iam.app_user WHERE id='40000000-0000-4000-8000-000000000011';
DELETE FROM iam.role_permission WHERE role_id='40000000-0000-4000-8000-000000000007';
DELETE FROM iam.permission WHERE id IN ('40000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000010');
DELETE FROM iam.role WHERE id='40000000-0000-4000-8000-000000000007';
DELETE FROM warehouse.location WHERE id='40000000-0000-4000-8000-000000000006'; DELETE FROM warehouse.zone WHERE id='40000000-0000-4000-8000-000000000005'; DELETE FROM warehouse.warehouse WHERE id='40000000-0000-4000-8000-000000000004';
DELETE FROM catalog.sku WHERE id='40000000-0000-4000-8000-000000000003'; DELETE FROM catalog.product WHERE id='40000000-0000-4000-8000-000000000002'; DELETE FROM catalog.unit_of_measure WHERE id='40000000-0000-4000-8000-000000000001'; COMMIT;
"@

$process = $null
try {
  docker compose exec -T postgres psql -U wms_app -d warehouse_wms -v ON_ERROR_STOP=1 -c $seed | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Phase 4 API smoke seed failed'}
  $process = Start-Process -FilePath 'node.exe' -ArgumentList 'backend/api/dist/main.js' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
  for ($i=0; $i -lt 20; $i++) { try { Invoke-RestMethod 'http://localhost:3100/api/v1/health' | Out-Null; break } catch { Start-Sleep -Milliseconds 300 } }
  $headers = @{ 'x-actor-id'='40000000-0000-4000-8000-000000000011'; 'x-correlation-id'='40000000-0000-4000-8000-000000000014'; 'Idempotency-Key'='phase4-api-post-0001' }
  $posting = @{ documentType='TEST_RECEIPT'; documentId='40000000-0000-4000-8000-000000000013'; reason='api smoke'; lines=@(@{skuId='40000000-0000-4000-8000-000000000003';batchId='40000000-0000-4000-8000-000000000012';quantity=100;destination=@{warehouseId='40000000-0000-4000-8000-000000000004';locationId='40000000-0000-4000-8000-000000000006';status='AVAILABLE'}})} | ConvertTo-Json -Depth 6
  Invoke-RestMethod 'http://localhost:3100/api/v1/inventory/postings' -Method Post -Headers $headers -ContentType 'application/json' -Body $posting | Out-Null
  $headers['Idempotency-Key']='phase4-api-reserve-0001'
  $reserveBody=@{demandType='ORDER';demandId='40000000-0000-4000-8000-000000000015';skuId='40000000-0000-4000-8000-000000000003';warehouseId='40000000-0000-4000-8000-000000000004';quantity=30}|ConvertTo-Json
  $reservation=Invoke-RestMethod 'http://localhost:3100/api/v1/inventory/reservations' -Method Post -Headers $headers -ContentType 'application/json' -Body $reserveBody
  $atp=Invoke-RestMethod 'http://localhost:3100/api/v1/inventory/atp?skuId=40000000-0000-4000-8000-000000000003&warehouseId=40000000-0000-4000-8000-000000000004' -Headers $headers
  if($atp.atp -ne 70){throw "Expected ATP 70, got $($atp.atp)"}
  Invoke-RestMethod "http://localhost:3100/api/v1/inventory/reservations/$($reservation.reservationId)/release" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{quantity=30}|ConvertTo-Json) | Out-Null
  $released=Invoke-RestMethod 'http://localhost:3100/api/v1/inventory/atp?skuId=40000000-0000-4000-8000-000000000003&warehouseId=40000000-0000-4000-8000-000000000004' -Headers $headers
  if($released.atp -ne 100){throw "Expected ATP 100 after release, got $($released.atp)"}
  Write-Output 'Phase 4 HTTP API smoke PASSED: posting 100, reserve 30 -> ATP 70, release -> ATP 100'
} finally {
  if($null -ne $process -and -not $process.HasExited){Stop-Process -Id $process.Id -Force}
  docker compose exec -T postgres psql -U wms_app -d warehouse_wms -v ON_ERROR_STOP=1 -c $cleanup | Out-Null
}
