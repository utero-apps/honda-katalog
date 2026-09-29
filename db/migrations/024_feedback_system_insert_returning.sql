CREATE POLICY service_order_feedback_system_read ON app.service_order_feedback
  FOR SELECT USING (app.is_system_auth());

DROP POLICY service_order_feedback_write ON app.service_order_feedback;
CREATE POLICY service_order_feedback_write ON app.service_order_feedback FOR INSERT WITH CHECK (
  (
    (app.has_role('owner','admin','cashier') AND recorded_by=app.current_app_user_id() AND submitted_via='staff')
    OR (app.is_system_auth() AND recorded_by IS NULL AND submitted_via='customer_token')
  )
  AND EXISTS (
    SELECT 1 FROM app.service_orders so
    WHERE so.id=service_order_feedback.service_order_id AND so.status='completed'
      AND so.handed_over_at IS NOT NULL AND so.customer_id=service_order_feedback.customer_id
      AND so.assigned_mechanic_id=service_order_feedback.mechanic_id
  )
);
