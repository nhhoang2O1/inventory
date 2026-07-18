CREATE TABLE integration.master_data_export_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  format text NOT NULL DEFAULT 'CSV' CHECK (format IN ('CSV','XLSX')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','EXPIRED')),
  requested_by uuid NOT NULL REFERENCES iam.app_user(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES warehouse.warehouse(id) ON DELETE RESTRICT,
  object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  CHECK ((status='COMPLETED' AND object_key IS NOT NULL AND completed_at IS NOT NULL) OR status<>'COMPLETED')
);
CREATE INDEX ix_master_export_owner ON integration.master_data_export_job(requested_by,created_at DESC);
COMMENT ON TABLE integration.master_data_export_job IS 'Asynchronous permission-scoped master data export; object storage key is private and time-limited by the delivery layer.';
