param(
  [string]$ContainerName = 'warehouse-wms-postgres-1',
  [string]$DatabaseUser = 'wms_app',
  [string]$SourceDatabase = 'warehouse_wms',
  [string]$RestoreDatabase = 'warehouse_wms_phase10_restore'
)

$ErrorActionPreference = 'Stop'
$backupPath = '/tmp/warehouse_wms_phase10_restore.dump'

if ($SourceDatabase -notmatch '^[a-z][a-z0-9_]{2,62}$') {
  throw "Unsafe source database name '$SourceDatabase'."
}
if ($RestoreDatabase -notmatch '^warehouse_wms_phase10_restore(_[a-z0-9]+)?$') {
  throw "Restore database must use the dedicated warehouse_wms_phase10_restore prefix."
}
if ($SourceDatabase -eq $RestoreDatabase) { throw 'Source and restore databases must differ.' }

& docker inspect $ContainerName | Out-Null
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL container '$ContainerName' is unavailable." }

try {
  & docker exec $ContainerName pg_dump --username $DatabaseUser --format custom --file $backupPath $SourceDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Backup creation failed.' }
  & docker exec $ContainerName dropdb --username $DatabaseUser --if-exists --force $RestoreDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Temporary restore database reset failed.' }
  & docker exec $ContainerName createdb --username $DatabaseUser $RestoreDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Temporary restore database creation failed.' }
  & docker exec $ContainerName pg_restore --username $DatabaseUser --dbname $RestoreDatabase --exit-on-error $backupPath
  if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }

  $sourceCount = & docker exec $ContainerName psql --username $DatabaseUser --dbname $SourceDatabase --tuples-only --no-align --command 'SELECT count(*) FROM platform.schema_migration'
  $restoreCount = & docker exec $ContainerName psql --username $DatabaseUser --dbname $RestoreDatabase --tuples-only --no-align --command 'SELECT count(*) FROM platform.schema_migration'
  if ($LASTEXITCODE -ne 0 -or [int]$sourceCount -ne [int]$restoreCount) {
    throw "Restore verification failed: migration counts source=$sourceCount restore=$restoreCount."
  }
  Write-Output "Phase 10 backup/restore rehearsal passed with $restoreCount migrations restored."
}
finally {
  if ($RestoreDatabase -match '^warehouse_wms_phase10_restore(_[a-z0-9]+)?$') {
    & docker exec $ContainerName dropdb --username $DatabaseUser --if-exists --force $RestoreDatabase | Out-Null
  }
  & docker exec $ContainerName rm -f $backupPath | Out-Null
}
