# Phase 10 Release Runbook

## 1. Release candidate

1. Freeze the candidate commit and assign a release version.
2. Run `npm ci`, `npm audit --omit=dev`, `npm run build` and `npm test`.
3. Run `scripts/phase10-migration-dry-run.ps1` against the local PostgreSQL 17 container. Both isolated databases must migrate from `0001` through `0017`, pass an idempotent rerun and report no operational blocker.
4. Run `scripts/phase10-backup-restore.ps1` against an approved non-production source database.
5. Deploy the same images to staging and run `npm run phase10:smoke`.
6. Complete the UAT matrix and record every result through `POST /api/v1/release/gates`.
7. Set `RELEASE_VERSION` and `RELEASE_ENVIRONMENT=STAGING`, then run `npm run phase10:gate`.

Never run the development seed in production. Never modify an applied migration.

## 2. Required release evidence

The release lead records:

- two `MIGRATION_DRY_RUN` passes with database names, migration head and timestamps;
- `REGRESSION`, `PERFORMANCE`, `SECURITY`, `BACKUP_RESTORE`, `UAT`, `RECONCILIATION` and `SMOKE`;
- a final `GO_NO_GO` decision with approvers, planned window and rollback owner.

Each write requires `RELEASE.MANAGE`, a correlation ID and a unique `Idempotency-Key`. Evidence rows are append-only.

## 3. Cutover

1. Announce the maintenance window and stop new business writes.
2. Confirm outbox and integration workers are drained.
3. Create and verify the backup.
4. Apply forward migrations once; confirm the head is `0017_phase10_release_readiness.sql`.
5. Deploy API, worker and web images from the approved candidate commit.
6. Check `/api/v1/health`, `/api/v1/health/ready`, authenticated login/logout and one approved read-only warehouse query.
7. Re-enable writes and workers.
8. Run ledger-to-balance, stale idempotency, outbox and dead-letter reconciliation.

## 4. Rollback

Database migrations are forward-only. Do not down-migrate or edit an applied SQL file.

- Before business writes resume: restore the verified pre-cutover backup and redeploy the previous images.
- After business writes resume: stop writes, preserve audit/outbox evidence, assess a forward corrective migration, and restore only when the incident commander and business owner accept the recovery point.
- Record the decision, timestamps, affected warehouses and reconciliation result as a failed or blocked release gate.

## 5. Hypercare

For the first 24 hours, monitor every 15 minutes, then hourly for the next 48 hours:

- readiness endpoint and API error rate;
- database saturation and slow queries;
- inventory reconciliation variance;
- stale idempotency records;
- pending/failed/dead-letter outbox deliveries;
- active stocktake locks;
- login failure/throttling anomalies.

Any non-zero inventory variance or unexplained dead letter blocks further release activity and starts the incident process.
