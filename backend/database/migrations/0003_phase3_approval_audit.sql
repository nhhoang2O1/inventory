CREATE SCHEMA IF NOT EXISTS approval;

CREATE TABLE approval.policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(btrim(code))),
  name text NOT NULL CHECK (btrim(name) <> ''),
  document_type text NOT NULL CHECK (document_type = upper(btrim(document_type))),
  warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  currency char(3) CHECK (currency IS NULL OR currency = upper(currency)),
  minimum_amount numeric(19,4),
  maximum_amount numeric(19,4),
  required_levels smallint NOT NULL CHECK (required_levels > 0),
  four_eyes_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (minimum_amount IS NULL OR minimum_amount >= 0),
  CHECK (maximum_amount IS NULL OR maximum_amount >= 0),
  CHECK (maximum_amount IS NULL OR minimum_amount IS NULL OR maximum_amount > minimum_amount),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE approval.policy_level (
  policy_id uuid NOT NULL REFERENCES approval.policy(id) ON DELETE RESTRICT,
  level_number smallint NOT NULL CHECK (level_number > 0),
  permission_id uuid NOT NULL REFERENCES iam.permission(id) ON DELETE RESTRICT,
  approvals_required smallint NOT NULL DEFAULT 1 CHECK (approvals_required > 0),
  PRIMARY KEY (policy_id, level_number)
);

CREATE TABLE approval.delegation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_user_id uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  delegate_user_id uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  permission_id uuid REFERENCES iam.permission(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  approved_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (delegator_user_id <> delegate_user_id),
  CHECK (approved_by <> delegator_user_id AND approved_by <> delegate_user_id),
  CHECK (valid_until > valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE approval.approval_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES approval.policy(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (btrim(resource_type) <> ''),
  resource_id uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  amount numeric(19,4),
  currency char(3),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  current_level smallint NOT NULL DEFAULT 1 CHECK (current_level > 0),
  required_levels smallint NOT NULL CHECK (required_levels > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (resource_type, resource_id, policy_id),
  CHECK (amount IS NULL OR amount >= 0),
  CHECK (currency IS NULL OR currency = upper(currency)),
  CHECK (current_level <= required_levels),
  CHECK ((status = 'PENDING' AND completed_at IS NULL) OR (status <> 'PENDING' AND completed_at IS NOT NULL))
);

CREATE TABLE approval.approval_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES approval.approval_request(id) ON DELETE RESTRICT,
  level_number smallint NOT NULL CHECK (level_number > 0),
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  actor_id uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  delegation_id uuid REFERENCES approval.delegation(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  request_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, level_number, actor_id)
);

CREATE OR REPLACE FUNCTION approval.validate_approval_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  maker_id uuid;
  needs_four_eyes boolean;
  request_status text;
BEGIN
  SELECT r.created_by, p.four_eyes_required, r.status
    INTO maker_id, needs_four_eyes, request_status
    FROM approval.approval_request r
    JOIN approval.policy p ON p.id = r.policy_id
   WHERE r.id = NEW.approval_request_id;
  IF request_status <> 'PENDING' THEN
    RAISE EXCEPTION 'approval request is not pending';
  END IF;
  IF needs_four_eyes AND maker_id = NEW.actor_id THEN
    RAISE EXCEPTION 'four-eyes violation: creator cannot approve own request';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_approval_event_validate
BEFORE INSERT ON approval.approval_event
FOR EACH ROW EXECUTE FUNCTION approval.validate_approval_event();

CREATE TRIGGER trg_approval_event_append_only
BEFORE UPDATE OR DELETE ON approval.approval_event
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

ALTER TABLE audit.audit_event
  ADD COLUMN effective_role_id uuid REFERENCES iam.role(id) ON DELETE SET NULL,
  ADD COLUMN warehouse_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN ip_address inet,
  ADD COLUMN device_id text,
  ADD COLUMN session_id uuid,
  ADD COLUMN approval_request_id uuid REFERENCES approval.approval_request(id) ON DELETE SET NULL,
  ADD COLUMN override_used boolean NOT NULL DEFAULT false,
  ADD COLUMN outcome text NOT NULL DEFAULT 'SUCCESS'
    CHECK (outcome IN ('SUCCESS', 'REJECTED', 'FAILED'));

CREATE INDEX ix_approval_policy_lookup
  ON approval.policy (document_type, warehouse_id, valid_from, valid_until)
  WHERE status = 'ACTIVE';
CREATE INDEX ix_approval_request_pending
  ON approval.approval_request (warehouse_id, requested_at)
  WHERE status = 'PENDING';
CREATE INDEX ix_approval_event_request
  ON approval.approval_event (approval_request_id, level_number, decided_at);

COMMENT ON TABLE approval.policy IS 'Effective-dated configurable approval levels and value thresholds; no business thresholds are hard-coded.';
COMMENT ON TABLE approval.approval_event IS 'Append-only approval decision history protected by four-eyes validation.';
