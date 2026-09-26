CREATE OR REPLACE FUNCTION app.current_app_user_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION app.current_app_role()
RETURNS app.user_role LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '')::app.user_role
$$;
CREATE OR REPLACE FUNCTION app.is_system_auth()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.system_auth', true) = 'true'
$$;
CREATE OR REPLACE FUNCTION app.has_role(VARIADIC roles app.user_role[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_app_user_id() IS NOT NULL AND app.current_app_role() = ANY(roles)
$$;
CREATE OR REPLACE FUNCTION app.is_authenticated()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_app_user_id() IS NOT NULL AND app.current_app_role() IS NOT NULL
$$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO honda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO honda_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO honda_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO honda_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO honda_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_app_user_id(), app.current_app_role(), app.is_system_auth(), app.is_authenticated() TO honda_runtime;
GRANT EXECUTE ON FUNCTION app.has_role(app.user_role[]) TO honda_runtime;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'roles','permissions','role_permissions','users','sessions','audit_events',
    'product_categories','vehicle_models','products','product_barcodes','product_vehicle_compatibility','product_prices',
    'customers','customer_vehicles','mechanics','service_orders','service_order_jobs','service_order_parts','service_order_status_history','quality_checks',
    'warehouses','inventory_balances','stock_movements','stock_opnames','stock_opname_items',
    'vendors','vendor_products','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items',
    'customer_invoices','customer_invoice_items','vendor_invoices','payments','expenses','mechanic_fees',
    'customer_follow_ups','service_reminders'
  ] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY users_select ON app.users FOR SELECT USING (
  app.is_system_auth() OR app.current_app_user_id() = id OR app.has_role('owner','admin')
);
CREATE POLICY users_insert ON app.users FOR INSERT WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY users_update ON app.users FOR UPDATE USING (app.current_app_user_id() = id OR app.has_role('owner','admin'))
  WITH CHECK (app.current_app_user_id() = id OR app.has_role('owner','admin'));
CREATE POLICY roles_read ON app.roles FOR SELECT USING (app.is_authenticated());
CREATE POLICY roles_manage ON app.roles FOR ALL USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY permissions_read ON app.permissions FOR SELECT USING (app.is_authenticated());
CREATE POLICY permissions_manage ON app.permissions FOR ALL USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY role_permissions_read ON app.role_permissions FOR SELECT USING (app.is_authenticated());
CREATE POLICY role_permissions_manage ON app.role_permissions FOR ALL USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY sessions_auth ON app.sessions FOR SELECT USING (app.is_system_auth() OR app.current_app_user_id() = user_id OR app.has_role('owner','admin'));
CREATE POLICY sessions_insert ON app.sessions FOR INSERT WITH CHECK (app.is_system_auth() OR app.current_app_user_id() = user_id);
CREATE POLICY sessions_update ON app.sessions FOR UPDATE USING (app.is_system_auth() OR app.current_app_user_id() = user_id OR app.has_role('owner','admin'));
CREATE POLICY sessions_delete ON app.sessions FOR DELETE USING (app.is_system_auth() OR app.current_app_user_id() = user_id OR app.has_role('owner','admin'));
CREATE POLICY audit_read ON app.audit_events FOR SELECT USING (app.has_role('owner','admin'));
CREATE POLICY audit_insert ON app.audit_events FOR INSERT WITH CHECK (app.is_authenticated() AND actor_id = app.current_app_user_id());

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['product_categories','vehicle_models','products','product_barcodes','product_vehicle_compatibility','product_prices'] LOOP
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT USING (app.is_authenticated())', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT WITH CHECK (app.has_role(''owner'',''admin'',''warehouse''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR UPDATE USING (app.has_role(''owner'',''admin'',''warehouse'')) WITH CHECK (app.has_role(''owner'',''admin'',''warehouse''))', table_name || '_update', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR DELETE USING (app.has_role(''owner'',''admin''))', table_name || '_delete', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['customers','customer_vehicles','service_orders','service_order_jobs','service_order_parts','service_order_status_history','quality_checks','customer_follow_ups','service_reminders'] LOOP
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT USING (app.is_authenticated())', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT WITH CHECK (app.has_role(''owner'',''admin'',''cashier'',''mechanic''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR UPDATE USING (app.has_role(''owner'',''admin'',''cashier'',''mechanic'')) WITH CHECK (app.has_role(''owner'',''admin'',''cashier'',''mechanic''))', table_name || '_update', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['warehouses','inventory_balances','stock_movements','stock_opnames','stock_opname_items'] LOOP
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT USING (app.is_authenticated())', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT WITH CHECK (app.has_role(''owner'',''admin'',''warehouse''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR UPDATE USING (app.has_role(''owner'',''admin'',''warehouse'')) WITH CHECK (app.has_role(''owner'',''admin'',''warehouse''))', table_name || '_update', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['vendors','vendor_products','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items'] LOOP
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT USING (app.has_role(''owner'',''admin'',''warehouse'',''finance''))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT WITH CHECK (app.has_role(''owner'',''admin'',''warehouse''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR UPDATE USING (app.has_role(''owner'',''admin'',''warehouse'')) WITH CHECK (app.has_role(''owner'',''admin'',''warehouse''))', table_name || '_update', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['customer_invoices','customer_invoice_items','vendor_invoices','payments','expenses','mechanic_fees'] LOOP
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT USING (app.has_role(''owner'',''admin'',''finance''))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT WITH CHECK (app.has_role(''owner'',''admin'',''finance''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR UPDATE USING (app.has_role(''owner'',''admin'',''finance'')) WITH CHECK (app.has_role(''owner'',''admin'',''finance''))', table_name || '_update', table_name);
  END LOOP;
END $$;

CREATE POLICY mechanics_read ON app.mechanics FOR SELECT USING (app.is_authenticated());
CREATE POLICY mechanics_manage ON app.mechanics FOR ALL USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
