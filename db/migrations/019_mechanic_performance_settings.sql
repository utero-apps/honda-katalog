ALTER TABLE app.mechanics
  ADD COLUMN monthly_target_orders integer CHECK (monthly_target_orders IS NULL OR monthly_target_orders > 0),
  ADD COLUMN weekly_capacity_orders integer CHECK (weekly_capacity_orders IS NULL OR weekly_capacity_orders > 0),
  ADD COLUMN bonus_per_completed_order numeric(14,2) CHECK (bonus_per_completed_order IS NULL OR bonus_per_completed_order >= 0);

CREATE TABLE app.service_order_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL UNIQUE REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  mechanic_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments text CHECK (comments IS NULL OR char_length(comments) <= 2000),
  recorded_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.service_order_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_order_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY service_order_feedback_read ON app.service_order_feedback FOR SELECT USING (app.is_authenticated());
CREATE POLICY service_order_feedback_write ON app.service_order_feedback FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND recorded_by=app.current_app_user_id()
  AND EXISTS (SELECT 1 FROM app.service_orders so WHERE so.id=service_order_id AND so.status='completed' AND so.customer_id=customer_id AND so.assigned_mechanic_id=mechanic_id)
);
CREATE POLICY service_order_feedback_update ON app.service_order_feedback FOR UPDATE
USING (app.has_role('owner','admin','cashier')) WITH CHECK (
  app.has_role('owner','admin','cashier') AND recorded_by=app.current_app_user_id()
  AND EXISTS (SELECT 1 FROM app.service_orders so WHERE so.id=service_order_id AND so.status='completed' AND so.customer_id=customer_id AND so.assigned_mechanic_id=mechanic_id)
);
GRANT SELECT, INSERT, UPDATE ON app.service_order_feedback TO honda_runtime;
