CREATE POLICY service_catalog_read ON app.pos_services
  FOR SELECT USING (app.has_role('mechanic'));
