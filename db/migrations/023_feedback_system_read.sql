CREATE POLICY service_orders_completed_system_read ON app.service_orders
  FOR SELECT USING (app.is_system_auth() AND status='completed' AND handed_over_at IS NOT NULL);
