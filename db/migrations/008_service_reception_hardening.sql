ALTER TABLE app.service_receptions
  DROP CONSTRAINT IF EXISTS service_receptions_idempotency_key_key;

CREATE UNIQUE INDEX service_receptions_actor_idempotency_key
  ON app.service_receptions(received_by, idempotency_key);

DROP POLICY IF EXISTS service_receptions_read ON app.service_receptions;
CREATE POLICY service_receptions_read ON app.service_receptions
  FOR SELECT USING (app.has_role('owner','admin','cashier','mechanic'));

DROP POLICY IF EXISTS vehicle_odometer_logs_read ON app.vehicle_odometer_logs;
CREATE POLICY vehicle_odometer_logs_read ON app.vehicle_odometer_logs
  FOR SELECT USING (app.has_role('owner','admin','cashier','mechanic'));
