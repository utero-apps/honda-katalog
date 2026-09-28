ALTER TABLE app.service_orders
  ADD COLUMN target_completion_at timestamptz,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  ADD COLUMN approval_notes text,
  ADD COLUMN handed_over_at timestamptz,
  ADD COLUMN handed_over_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  ADD COLUMN handover_recipient_name text,
  ADD COLUMN handover_signature_reference text,
  ADD COLUMN handover_notes text;

ALTER TABLE app.service_orders
  ADD CONSTRAINT service_orders_target_completion_check CHECK (target_completion_at IS NULL OR opened_at IS NULL OR target_completion_at >= opened_at),
  ADD CONSTRAINT service_orders_signature_reference_check CHECK (handover_signature_reference IS NULL OR (char_length(handover_signature_reference) BETWEEN 3 AND 2_000 AND handover_signature_reference !~* '^data:'));

CREATE TABLE app.service_order_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES app.service_order_jobs(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('vehicle','job','quality_control')),
  url text NOT NULL CHECK (char_length(url) BETWEEN 3 AND 2_000 AND url !~* '^data:' AND url ~ '^(https?://|/)'),
  notes text,
  uploaded_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((evidence_type='job' AND job_id IS NOT NULL) OR (evidence_type<>'job' AND job_id IS NULL))
);
CREATE INDEX service_order_evidence_order_idx ON app.service_order_evidence(service_order_id,created_at,id);

ALTER TABLE app.service_order_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_order_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY service_order_evidence_read ON app.service_order_evidence FOR SELECT USING (app.has_role('owner','admin','cashier','mechanic'));
CREATE POLICY service_order_evidence_insert ON app.service_order_evidence FOR INSERT WITH CHECK (app.has_role('owner','admin','cashier','mechanic') AND uploaded_by=app.current_app_user_id());

CREATE SEQUENCE app.service_invoice_number_seq;
CREATE SEQUENCE app.service_payment_number_seq;

ALTER TABLE app.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE app.payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cash','transfer','card','qris','other'));

DROP POLICY IF EXISTS customer_invoices_read ON app.customer_invoices;
DROP POLICY IF EXISTS customer_invoices_insert ON app.customer_invoices;
DROP POLICY IF EXISTS customer_invoices_update ON app.customer_invoices;
DROP POLICY IF EXISTS customer_invoice_items_read ON app.customer_invoice_items;
DROP POLICY IF EXISTS customer_invoice_items_insert ON app.customer_invoice_items;
DROP POLICY IF EXISTS payments_read ON app.payments;
DROP POLICY IF EXISTS payments_insert ON app.payments;
CREATE POLICY customer_invoices_read ON app.customer_invoices FOR SELECT USING (app.has_role('owner','admin','finance','cashier'));
CREATE POLICY customer_invoices_insert ON app.customer_invoices FOR INSERT WITH CHECK (app.has_role('owner','admin','finance','cashier'));
CREATE POLICY customer_invoices_update ON app.customer_invoices FOR UPDATE USING (app.has_role('owner','admin','finance','cashier')) WITH CHECK (app.has_role('owner','admin','finance','cashier'));
CREATE POLICY customer_invoice_items_read ON app.customer_invoice_items FOR SELECT USING (app.has_role('owner','admin','finance','cashier'));
CREATE POLICY customer_invoice_items_insert ON app.customer_invoice_items FOR INSERT WITH CHECK (app.has_role('owner','admin','finance','cashier'));
CREATE POLICY payments_read ON app.payments FOR SELECT USING (app.has_role('owner','admin','finance','cashier'));
CREATE POLICY payments_insert ON app.payments FOR INSERT WITH CHECK (app.has_role('owner','admin','finance','cashier') AND received_by=app.current_app_user_id());

CREATE INDEX service_orders_workflow_idx
  ON app.service_orders(status, approved_at, handed_over_at, updated_at DESC);

ALTER TABLE app.service_orders
  ADD CONSTRAINT service_orders_approval_handover_check CHECK (
    (approved_at IS NULL AND approved_by IS NULL)
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
  ),
  ADD CONSTRAINT service_orders_handover_check CHECK (
    (handed_over_at IS NULL AND handed_over_by IS NULL)
    OR (handed_over_at IS NOT NULL AND handed_over_by IS NOT NULL)
  );

GRANT USAGE, SELECT ON SEQUENCE app.service_invoice_number_seq, app.service_payment_number_seq TO honda_runtime;
GRANT SELECT, INSERT ON app.service_order_evidence TO honda_runtime;
