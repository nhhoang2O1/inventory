CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS warehouse;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS receiving;
CREATE SCHEMA IF NOT EXISTS outbound;
CREATE SCHEMA IF NOT EXISTS transfer;
CREATE SCHEMA IF NOT EXISTS stocktake;
CREATE SCHEMA IF NOT EXISTS quality;
CREATE SCHEMA IF NOT EXISTS recall;
CREATE SCHEMA IF NOT EXISTS planning;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE platform.idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  state text NOT NULL DEFAULT 'PROCESSING'
    CHECK (state IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT uq_idempotency_scope UNIQUE (caller_id, operation, idempotency_key),
  CONSTRAINT ck_idempotency_http_status CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599)
);

CREATE INDEX ix_idempotency_processing
  ON platform.idempotency_record (locked_until)
  WHERE state = 'PROCESSING';

CREATE TABLE platform.outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  payload jsonb NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  causation_id uuid,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text
);

CREATE INDEX ix_outbox_pending
  ON platform.outbox_event (available_at, occurred_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE audit.audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'USER',
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  warehouse_id uuid,
  correlation_id uuid NOT NULL,
  request_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ix_audit_resource ON audit.audit_event (resource_type, resource_id, occurred_at DESC);
CREATE INDEX ix_audit_actor ON audit.audit_event (actor_id, occurred_at DESC);
CREATE INDEX ix_audit_correlation ON audit.audit_event (correlation_id);

CREATE OR REPLACE FUNCTION audit.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only';
END;
$$;

CREATE TRIGGER trg_audit_event_append_only
BEFORE UPDATE OR DELETE ON audit.audit_event
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

COMMENT ON SCHEMA inventory IS 'Owned exclusively by Inventory Core from Phase 4.';
COMMENT ON TABLE platform.idempotency_record IS 'Canonical command idempotency store.';
COMMENT ON TABLE platform.outbox_event IS 'Events written in the same transaction as domain state.';
COMMENT ON TABLE audit.audit_event IS 'Append-only security and business audit trail.';
