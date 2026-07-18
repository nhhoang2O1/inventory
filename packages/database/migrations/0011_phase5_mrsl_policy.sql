CREATE TABLE receiving.mrsl_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL REFERENCES catalog.sku(id) ON DELETE RESTRICT,
  min_remaining_days integer NOT NULL CHECK (min_remaining_days > 0),
  exception_mode text NOT NULL DEFAULT 'REJECT' CHECK (exception_mode IN ('REJECT', 'QUARANTINE', 'ALLOW_WITH_APPROVAL')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  UNIQUE (sku_id, valid_from)
);
