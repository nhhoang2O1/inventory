INSERT INTO iam.permission (code,name,description) VALUES
  ('INVENTORY.VIEW','View inventory','View scoped inventory, ATP, batches and topology'),
  ('INVENTORY.RESERVE','Reserve inventory','Create and release warehouse-scoped reservations'),
  ('INVENTORY.POST','Post inventory','Post canonical inventory movements'),
  ('INVENTORY.REVERSE','Reverse inventory movement','Create an append-only reversal of a canonical movement'),
  ('INVENTORY.RECONCILE','Reconcile inventory','View ledger-to-balance reconciliation'),
  ('CATALOG.VIEW','View catalog','View active SKU, UOM and batch metadata'),
  ('WAREHOUSE.VIEW','View warehouse topology','View active warehouse topology in the actor scope'),
  ('IAM.USER_VIEW','View users','View active users for controlled workflow assignment'),
  ('IAM.USER_MANAGE','Manage users','Create audited users with an approved role'),
  ('RELEASE.VIEW','View release readiness','View release gates and operational readiness'),
  ('RELEASE.MANAGE','Manage release gates','Record immutable UAT, migration, security and cutover gate evidence')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE iam.auth_login_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  user_id uuid REFERENCES iam.app_user(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('SUCCEEDED','FAILED','THROTTLED')),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_auth_attempt_throttle
  ON iam.auth_login_attempt (username,occurred_at DESC)
  WHERE outcome IN ('FAILED','THROTTLED');

CREATE TABLE iam.auth_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at>created_at),
  CHECK (revoked_at IS NULL OR revoked_at>=created_at)
);

CREATE INDEX ix_auth_session_active
  ON iam.auth_session (token_hash,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE platform.release_gate_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version text NOT NULL CHECK (btrim(release_version)<>''),
  environment text NOT NULL CHECK (environment IN ('TEST','STAGING','PRODUCTION')),
  gate_type text NOT NULL CHECK (gate_type IN (
    'REGRESSION','MIGRATION_DRY_RUN','PERFORMANCE','SECURITY','BACKUP_RESTORE',
    'UAT','RECONCILIATION','SMOKE','GO_NO_GO'
  )),
  status text NOT NULL CHECK (status IN ('PASSED','FAILED','BLOCKED')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash)=64),
  executed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (executed_by,idempotency_key)
);

CREATE INDEX ix_release_gate_version
  ON platform.release_gate_run (release_version,environment,gate_type,executed_at DESC);

CREATE VIEW platform.release_readiness_snapshot AS
SELECT
  now() AS observed_at,
  (SELECT count(*)::bigint FROM inventory.ledger_balance_reconciliation WHERE variance<>0) AS inventory_variance_count,
  (SELECT count(*)::bigint FROM platform.outbox_event
    WHERE status IN ('PENDING','FAILED','PROCESSING') AND occurred_at<now()-interval '5 minutes') AS stale_outbox_count,
  (SELECT count(*)::bigint FROM platform.outbox_event WHERE status='DEAD_LETTER') AS outbox_dead_letter_count,
  (SELECT count(*)::bigint FROM integration.outbox_delivery WHERE status='DEAD_LETTER') AS integration_dead_letter_count,
  (SELECT count(*)::bigint FROM platform.idempotency_record
    WHERE state='PROCESSING' AND locked_until<now()) AS stale_idempotency_count,
  (SELECT count(*)::bigint FROM warehouse.location WHERE status='LOCKED') AS active_stocktake_lock_count;

CREATE TRIGGER trg_auth_login_attempt_append_only
BEFORE UPDATE OR DELETE ON iam.auth_login_attempt
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TRIGGER trg_release_gate_run_append_only
BEFORE UPDATE OR DELETE ON platform.release_gate_run
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

COMMENT ON TABLE iam.auth_session IS 'Short-lived opaque local-auth session; only a SHA-256 token hash is stored.';
COMMENT ON TABLE platform.release_gate_run IS 'Immutable Phase 10 release/UAT evidence recorded by an authorized release lead.';
COMMENT ON VIEW platform.release_readiness_snapshot IS 'Operational go/no-go signals; every count except active planned locks should be zero.';
