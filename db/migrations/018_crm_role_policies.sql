DROP POLICY customer_follow_ups_insert ON app.customer_follow_ups;
DROP POLICY customer_follow_ups_update ON app.customer_follow_ups;
DROP POLICY service_reminders_insert ON app.service_reminders;
DROP POLICY service_reminders_update ON app.service_reminders;

CREATE POLICY customer_follow_ups_insert ON app.customer_follow_ups
FOR INSERT WITH CHECK (
  app.has_role('owner','admin') OR
  (app.has_role('cashier') AND EXISTS (
    SELECT 1 FROM app.service_orders so
    WHERE so.id=service_order_id AND so.customer_id=customer_id
      AND so.status='completed' AND so.handed_over_by=app.current_app_user_id()
      AND automation_key='handover-follow-up:' || so.id::text
  ))
);
CREATE POLICY customer_follow_ups_update ON app.customer_follow_ups
FOR UPDATE USING (app.has_role('owner','admin'))
WITH CHECK (app.has_role('owner','admin'));

CREATE POLICY service_reminders_insert ON app.service_reminders
FOR INSERT WITH CHECK (
  app.has_role('owner','admin') OR
  (app.has_role('cashier') AND EXISTS (
    SELECT 1 FROM app.service_orders so
    WHERE so.id::text=substr(automation_key,length('handover-reminder:')+1)
      AND so.vehicle_id=vehicle_id AND so.customer_id=customer_id
      AND so.status='completed' AND so.handed_over_by=app.current_app_user_id()
      AND automation_key='handover-reminder:' || so.id::text
  ))
);
CREATE POLICY service_reminders_update ON app.service_reminders
FOR UPDATE USING (app.has_role('owner','admin'))
WITH CHECK (app.has_role('owner','admin'));
