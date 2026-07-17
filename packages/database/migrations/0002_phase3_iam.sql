CREATE TABLE warehouse.warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT uq_warehouse_code UNIQUE (code),
  CONSTRAINT ck_warehouse_code_normalized CHECK (code = upper(btrim(code))),
  CONSTRAINT ck_warehouse_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT ck_warehouse_deactivation CHECK (
    (status = 'ACTIVE' AND deactivated_at IS NULL)
    OR (status = 'INACTIVE' AND deactivated_at IS NOT NULL)
  )
);

CREATE TABLE iam.role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  is_system boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT uq_role_code UNIQUE (code),
  CONSTRAINT ck_role_code_normalized CHECK (code = upper(btrim(code))),
  CONSTRAINT ck_role_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT ck_role_deactivation CHECK (
    (status = 'ACTIVE' AND deactivated_at IS NULL)
    OR (status = 'INACTIVE' AND deactivated_at IS NOT NULL)
  )
);

CREATE TABLE iam.permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT uq_permission_code UNIQUE (code),
  CONSTRAINT ck_permission_code_normalized CHECK (code = upper(btrim(code))),
  CONSTRAINT ck_permission_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT ck_permission_deactivation CHECK (
    (status = 'ACTIVE' AND deactivated_at IS NULL)
    OR (status = 'INACTIVE' AND deactivated_at IS NOT NULL)
  )
);

CREATE TABLE iam.role_permission (
  role_id uuid NOT NULL REFERENCES iam.role(id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES iam.permission(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE iam.app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  display_name text NOT NULL,
  email text,
  role_id uuid NOT NULL REFERENCES iam.role(id) ON DELETE RESTRICT,
  auth_provider text NOT NULL DEFAULT 'LOCAL'
    CHECK (auth_provider IN ('LOCAL', 'OIDC')),
  password_hash text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'LOCKED', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT uq_user_username UNIQUE (username),
  CONSTRAINT uq_user_email UNIQUE (email),
  CONSTRAINT ck_user_username_normalized CHECK (username = lower(btrim(username))),
  CONSTRAINT ck_user_email_normalized CHECK (email IS NULL OR email = lower(btrim(email))),
  CONSTRAINT ck_user_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT ck_user_local_password CHECK (auth_provider <> 'LOCAL' OR password_hash IS NOT NULL),
  CONSTRAINT ck_user_deactivation CHECK (
    (status IN ('ACTIVE', 'LOCKED') AND deactivated_at IS NULL)
    OR (status = 'INACTIVE' AND deactivated_at IS NOT NULL)
  )
);

ALTER TABLE iam.role_permission
  ADD CONSTRAINT fk_role_permission_granted_by
  FOREIGN KEY (granted_by) REFERENCES iam.app_user(id) ON DELETE SET NULL;

CREATE TABLE iam.user_warehouse_scope (
  user_id uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  granted_by uuid REFERENCES iam.app_user(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, warehouse_id, valid_from),
  CONSTRAINT ck_warehouse_scope_window CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT ck_warehouse_scope_revoke CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE INDEX ix_app_user_role ON iam.app_user (role_id) WHERE status = 'ACTIVE';
CREATE INDEX ix_role_permission_permission ON iam.role_permission (permission_id, role_id);
CREATE INDEX ix_user_warehouse_scope_active
  ON iam.user_warehouse_scope (user_id, warehouse_id, valid_from, valid_until)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE warehouse.warehouse IS 'Minimal warehouse identity required by IAM scope; topology is added in Phase 3 WP06.';
COMMENT ON TABLE iam.app_user IS 'One effective role per account; permissions are derived server-side from that role.';
COMMENT ON TABLE iam.user_warehouse_scope IS 'Effective-dated warehouse grants. Revocation preserves history.';
