ALTER TABLE app.service_order_feedback
  ALTER COLUMN recorded_by DROP NOT NULL,
  ADD COLUMN submitted_via text NOT NULL DEFAULT 'staff' CHECK (submitted_via IN ('staff','customer_token')),
  ADD CONSTRAINT service_order_feedback_actor_required CHECK (
    (submitted_via = 'staff' AND recorded_by IS NOT NULL)
    OR (submitted_via = 'customer_token' AND recorded_by IS NULL)
  );

CREATE TABLE app.customer_feedback_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  issued_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE UNIQUE INDEX customer_feedback_tokens_active_order_idx
  ON app.customer_feedback_tokens(service_order_id) WHERE used_at IS NULL;
CREATE INDEX customer_feedback_tokens_expiry_idx
  ON app.customer_feedback_tokens(expires_at) WHERE used_at IS NULL;

ALTER TABLE app.customer_feedback_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_feedback_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_feedback_tokens_staff_read ON app.customer_feedback_tokens
  FOR SELECT USING (app.is_system_auth() OR app.has_role('owner','admin','cashier'));
CREATE POLICY customer_feedback_tokens_staff_insert ON app.customer_feedback_tokens
  FOR INSERT WITH CHECK (app.is_system_auth() OR (app.has_role('owner','admin','cashier') AND issued_by=app.current_app_user_id()));
CREATE POLICY customer_feedback_tokens_staff_update ON app.customer_feedback_tokens
  FOR UPDATE USING (app.is_system_auth() OR app.has_role('owner','admin','cashier'))
  WITH CHECK (app.is_system_auth() OR app.has_role('owner','admin','cashier'));

DROP POLICY service_order_feedback_write ON app.service_order_feedback;
CREATE POLICY service_order_feedback_write ON app.service_order_feedback FOR INSERT WITH CHECK (
  (
    app.has_role('owner','admin','cashier') AND recorded_by=app.current_app_user_id() AND submitted_via='staff'
  ) OR (
    app.is_system_auth() AND recorded_by IS NULL AND submitted_via='customer_token'
  )
  AND EXISTS (
    SELECT 1 FROM app.service_orders so
    WHERE so.id=service_order_id AND so.status='completed' AND so.handed_over_at IS NOT NULL
      AND so.customer_id=customer_id AND so.assigned_mechanic_id=mechanic_id
  )
);

DROP POLICY service_order_feedback_update ON app.service_order_feedback;
CREATE POLICY service_order_feedback_update ON app.service_order_feedback FOR UPDATE
USING (app.has_role('owner','admin','cashier') AND submitted_via='staff')
WITH CHECK (app.has_role('owner','admin','cashier') AND submitted_via='staff' AND recorded_by=app.current_app_user_id());

GRANT SELECT, INSERT, UPDATE ON app.customer_feedback_tokens TO honda_runtime;
