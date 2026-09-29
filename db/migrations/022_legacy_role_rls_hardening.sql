CREATE POLICY service_orders_finance_workflow_guard ON app.service_orders
  AS RESTRICTIVE FOR UPDATE
  USING (NOT app.has_role('finance') OR (handed_over_at IS NULL AND status IN ('quality_check','invoiced','paid')))
  WITH CHECK (NOT app.has_role('finance') OR (handed_over_at IS NULL AND status IN ('invoiced','paid')));

CREATE FUNCTION app.guard_finance_service_order_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.has_role('finance') AND (
    NOT ((OLD.status='quality_check' AND NEW.status='invoiced') OR (OLD.status='invoiced' AND NEW.status='paid'))
    OR (to_jsonb(NEW) - ARRAY['status','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_by','updated_at'])
    OR NEW.updated_by IS DISTINCT FROM app.current_app_user_id()
  ) THEN
    RAISE EXCEPTION 'FINANCE_SERVICE_ORDER_UPDATE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_orders_finance_update_guard BEFORE UPDATE ON app.service_orders
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_service_order_update();
REVOKE ALL ON FUNCTION app.guard_finance_service_order_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_finance_service_order_update() TO honda_runtime;

CREATE POLICY service_order_parts_warehouse_workflow_guard ON app.service_order_parts
  AS RESTRICTIVE FOR UPDATE
  USING (NOT app.has_role('warehouse') OR (consumed_at IS NULL AND EXISTS (
    SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.status='in_progress' AND s.handed_over_at IS NULL
  )))
  WITH CHECK (NOT app.has_role('warehouse') OR (EXISTS (
    SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.status='in_progress' AND s.handed_over_at IS NULL
  )));
CREATE POLICY service_order_parts_warehouse_insert_guard ON app.service_order_parts
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app.has_role('warehouse') OR (consumed_at IS NULL AND EXISTS (
    SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.status='in_progress' AND s.handed_over_at IS NULL
  )));

CREATE FUNCTION app.guard_warehouse_service_part_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.has_role('warehouse') AND (
    (to_jsonb(NEW) - ARRAY['quantity','consumed_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['quantity','consumed_at'])
    OR NEW.quantity < OLD.quantity
    OR (NEW.quantity IS DISTINCT FROM OLD.quantity AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
    OR (NEW.consumed_at IS DISTINCT FROM OLD.consumed_at AND NEW.consumed_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'WAREHOUSE_SERVICE_PART_UPDATE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_order_parts_warehouse_update_guard BEFORE UPDATE ON app.service_order_parts
  FOR EACH ROW EXECUTE FUNCTION app.guard_warehouse_service_part_update();
REVOKE ALL ON FUNCTION app.guard_warehouse_service_part_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_warehouse_service_part_update() TO honda_runtime;

CREATE POLICY service_order_exit_checklists_insert_guard ON app.service_order_exit_checklists
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.handed_over_at IS NULL AND s.status NOT IN ('completed','cancelled')));
CREATE POLICY service_order_exit_checklists_update_guard ON app.service_order_exit_checklists
  AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.handed_over_at IS NULL AND s.status NOT IN ('completed','cancelled')))
  WITH CHECK (EXISTS (SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.handed_over_at IS NULL AND s.status NOT IN ('completed','cancelled')));

CREATE POLICY service_order_handover_assets_insert_guard ON app.service_order_handover_assets
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.handed_over_at IS NULL AND s.status NOT IN ('completed','cancelled')));
CREATE POLICY service_order_handover_assets_update_guard ON app.service_order_handover_assets
  AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.handed_over_at IS NULL AND s.status NOT IN ('completed','cancelled')))
  WITH CHECK (EXISTS (SELECT 1 FROM app.service_orders s WHERE s.id=service_order_id AND s.handed_over_at IS NULL AND s.status NOT IN ('completed','cancelled')));
