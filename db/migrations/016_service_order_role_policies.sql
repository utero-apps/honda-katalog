CREATE POLICY service_orders_finance_update
ON app.service_orders
FOR UPDATE
USING (app.has_role('finance'))
WITH CHECK (app.has_role('finance'));

CREATE POLICY service_order_status_history_finance_insert
ON app.service_order_status_history
FOR INSERT
WITH CHECK (app.has_role('finance') AND actor_id=app.current_app_user_id());

CREATE POLICY service_order_parts_warehouse_insert
ON app.service_order_parts
FOR INSERT
WITH CHECK (app.has_role('warehouse'));

CREATE POLICY service_order_parts_warehouse_update
ON app.service_order_parts
FOR UPDATE
USING (app.has_role('warehouse'))
WITH CHECK (app.has_role('warehouse'));
