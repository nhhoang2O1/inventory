param(
  [string]$ContainerName = 'warehouse-wms-postgres-1',
  [string]$DatabaseUser = 'wms_app',
  [string]$DatabasePassword = 'wms_local_only',
  [int]$HostPort = 55432
)

$ErrorActionPreference = 'Stop'
$databaseNames = @('warehouse_wms_phase10_dryrun_1', 'warehouse_wms_phase10_dryrun_2')
$previousDatabaseUrl = $env:DATABASE_URL

& docker inspect $ContainerName | Out-Null
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL container '$ContainerName' is unavailable." }

try {
  foreach ($databaseName in $databaseNames) {
    if ($databaseName -notmatch '^warehouse_wms_phase10_dryrun_[12]$') {
      throw "Refusing unsafe dry-run database name '$databaseName'."
    }
    & docker exec $ContainerName dropdb --username $DatabaseUser --if-exists --force $databaseName
    if ($LASTEXITCODE -ne 0) { throw "Could not reset temporary database '$databaseName'." }
    & docker exec $ContainerName createdb --username $DatabaseUser $databaseName
    if ($LASTEXITCODE -ne 0) { throw "Could not create temporary database '$databaseName'." }

    $env:DATABASE_URL = "postgresql://${DatabaseUser}:${DatabasePassword}@localhost:${HostPort}/${databaseName}"
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Migration failed for '$databaseName'." }
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Idempotent migration rerun failed for '$databaseName'." }
    & npm.cmd run db:migrate:status
    if ($LASTEXITCODE -ne 0) { throw "Migration status failed for '$databaseName'." }
    & npm.cmd run phase10:gate
    if ($LASTEXITCODE -ne 0) { throw "Operational release gate failed for '$databaseName'." }
  }
  Write-Output 'Phase 10 migration dry runs passed: 2/2.'
}
finally {
  foreach ($databaseName in $databaseNames) {
    if ($databaseName -match '^warehouse_wms_phase10_dryrun_[12]$') {
      & docker exec $ContainerName dropdb --username $DatabaseUser --if-exists --force $databaseName | Out-Null
    }
  }
  $env:DATABASE_URL = $previousDatabaseUrl
}
