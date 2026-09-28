CREATE TABLE app.service_order_exit_checklists (
  service_order_id uuid PRIMARY KEY REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  vehicle_checked boolean NOT NULL DEFAULT false,
  belongings_returned boolean NOT NULL DEFAULT false,
  keys_returned boolean NOT NULL DEFAULT false,
  work_explained boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  confirmed_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.service_order_handover_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('final_photo','signature')),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 32 AND 3145728),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_must_be_png CHECK (kind <> 'signature' OR (mime_type = 'image/png' AND octet_length(content) <= 262144))
);
CREATE INDEX service_order_handover_assets_order_idx ON app.service_order_handover_assets(service_order_id, kind, created_at);
CREATE UNIQUE INDEX service_order_handover_signature_unique ON app.service_order_handover_assets(service_order_id) WHERE kind='signature';

ALTER TABLE app.service_order_exit_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_order_exit_checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE app.service_order_handover_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_order_handover_assets FORCE ROW LEVEL SECURITY;

CREATE POLICY service_order_exit_checklists_read ON app.service_order_exit_checklists FOR SELECT USING (app.has_role('owner','admin','cashier','mechanic'));
CREATE POLICY service_order_exit_checklists_insert ON app.service_order_exit_checklists FOR INSERT WITH CHECK (app.has_role('owner','admin','cashier','mechanic') AND confirmed_by=app.current_app_user_id());
CREATE POLICY service_order_exit_checklists_update ON app.service_order_exit_checklists FOR UPDATE USING (app.has_role('owner','admin','cashier','mechanic')) WITH CHECK (app.has_role('owner','admin','cashier','mechanic') AND confirmed_by=app.current_app_user_id());
CREATE POLICY service_order_handover_assets_read ON app.service_order_handover_assets FOR SELECT USING (app.has_role('owner','admin','cashier','mechanic'));
CREATE POLICY service_order_handover_assets_insert ON app.service_order_handover_assets FOR INSERT WITH CHECK (app.has_role('owner','admin','cashier','mechanic') AND uploaded_by=app.current_app_user_id());
CREATE POLICY service_order_handover_assets_update ON app.service_order_handover_assets FOR UPDATE USING (app.has_role('owner','admin','cashier','mechanic')) WITH CHECK (app.has_role('owner','admin','cashier','mechanic') AND uploaded_by=app.current_app_user_id());

CREATE FUNCTION app.validate_service_order_handover_assets() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.handed_over_at IS NULL AND NEW.handed_over_at IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM app.service_order_exit_checklists c
      WHERE c.service_order_id=NEW.id AND c.vehicle_checked AND c.belongings_returned AND c.keys_returned AND c.work_explained
    ) OR NOT EXISTS (
      SELECT 1 FROM app.service_order_handover_assets a WHERE a.service_order_id=NEW.id AND a.kind='final_photo'
    ) OR NOT EXISTS (
      SELECT 1 FROM app.service_order_handover_assets a
      WHERE a.service_order_id=NEW.id AND a.kind='signature'
        AND NEW.handover_signature_reference = '/api/v1/operations/service-orders/' || NEW.id::text || '/handover-assets/' || a.id::text
    ) THEN
      RAISE EXCEPTION 'Checklist keluar, foto akhir, dan tanda tangan wajib sebelum serah terima' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_orders_handover_assets_required
BEFORE UPDATE OF handed_over_at ON app.service_orders
FOR EACH ROW EXECUTE FUNCTION app.validate_service_order_handover_assets();

REVOKE ALL ON FUNCTION app.validate_service_order_handover_assets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.validate_service_order_handover_assets() TO honda_runtime;
GRANT SELECT, INSERT, UPDATE ON app.service_order_exit_checklists TO honda_runtime;
GRANT SELECT, INSERT, UPDATE ON app.service_order_handover_assets TO honda_runtime;
