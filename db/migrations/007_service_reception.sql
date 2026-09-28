CREATE TYPE app.service_type AS ENUM ('general','monthly','mileage','routine');
ALTER TABLE app.service_orders ADD COLUMN service_type app.service_type NOT NULL DEFAULT 'general';
CREATE INDEX service_orders_vehicle_opened_idx ON app.service_orders(vehicle_id, opened_at DESC);

CREATE SEQUENCE app.service_reception_number_seq;

CREATE TABLE app.service_receptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL UNIQUE REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  service_type app.service_type NOT NULL,
  fuel_level numeric(5,2) CHECK (fuel_level IS NULL OR fuel_level BETWEEN 0 AND 100),
  physical_condition text,
  belongings text[] NOT NULL DEFAULT '{}',
  notes text,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommendations) = 'array'),
  received_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (char_length(request_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.vehicle_odometer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES app.customer_vehicles(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL UNIQUE REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  odometer numeric(14,1) NOT NULL CHECK (odometer >= 0),
  recorded_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  odometer_correction_reason text CHECK (odometer_correction_reason IS NULL OR char_length(trim(odometer_correction_reason)) BETWEEN 3 AND 1000)
);

CREATE INDEX service_receptions_received_idx ON app.service_receptions(received_at DESC);
CREATE INDEX vehicle_odometer_logs_vehicle_idx ON app.vehicle_odometer_logs(vehicle_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION app.prevent_vehicle_odometer_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'VEHICLE_ODOMETER_LOGS_ARE_IMMUTABLE';
END;
$$;
CREATE TRIGGER vehicle_odometer_logs_no_mutation
BEFORE UPDATE OR DELETE ON app.vehicle_odometer_logs
FOR EACH ROW EXECUTE FUNCTION app.prevent_vehicle_odometer_log_mutation();

ALTER TABLE app.service_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_receptions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.vehicle_odometer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vehicle_odometer_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY service_receptions_read ON app.service_receptions FOR SELECT USING (app.is_authenticated());
CREATE POLICY service_receptions_insert ON app.service_receptions FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND received_by = app.current_app_user_id()
);
CREATE POLICY vehicle_odometer_logs_read ON app.vehicle_odometer_logs FOR SELECT USING (app.is_authenticated());
CREATE POLICY vehicle_odometer_logs_insert ON app.vehicle_odometer_logs FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND recorded_by = app.current_app_user_id()
);

GRANT SELECT, INSERT ON app.service_receptions, app.vehicle_odometer_logs TO honda_runtime;
GRANT USAGE, SELECT ON SEQUENCE app.service_reception_number_seq TO honda_runtime;
