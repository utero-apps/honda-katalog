CREATE TYPE app.pos_sale_status AS ENUM ('completed','voided');
CREATE TYPE app.pos_payment_method AS ENUM ('cash','card','transfer','qris','other');

CREATE SEQUENCE app.pos_sale_number_seq;

CREATE TABLE app.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{2,40}$'),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text NOT NULL UNIQUE,
  register_id uuid NOT NULL REFERENCES app.pos_registers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES app.customers(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  cashier_name text NOT NULL,
  status app.pos_sale_status NOT NULL DEFAULT 'completed',
  subtotal numeric(15,2) NOT NULL CHECK (subtotal >= 0),
  discount numeric(15,2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= subtotal),
  tax numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total numeric(15,2) NOT NULL CHECK (total > 0 AND total = subtotal - discount + tax),
  paid_amount numeric(15,2) NOT NULL CHECK (paid_amount >= total),
  change_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (change_amount = paid_amount - total),
  notes text,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (char_length(request_hash) = 64),
  completed_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'completed' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR
    (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND char_length(trim(void_reason)) BETWEEN 3 AND 1000)
  )
);

CREATE TABLE app.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES app.pos_sales(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  part_code text NOT NULL,
  product_name text NOT NULL,
  unit text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost numeric(15,2) NOT NULL CHECK (unit_cost >= 0),
  discount numeric(15,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total numeric(15,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount <= round(quantity * unit_price, 2)),
  UNIQUE(sale_id, product_id)
);

CREATE TABLE app.pos_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES app.pos_sales(id) ON DELETE RESTRICT,
  method app.pos_payment_method NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  reference text,
  received_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  reversal_reason text,
  CHECK (
    (reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
    OR
    (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND char_length(trim(reversal_reason)) BETWEEN 3 AND 1000)
  )
);

CREATE INDEX pos_sales_completed_idx ON app.pos_sales(completed_at DESC, id DESC);
CREATE INDEX pos_sales_register_idx ON app.pos_sales(register_id, completed_at DESC);
CREATE INDEX pos_sales_cashier_idx ON app.pos_sales(cashier_id, completed_at DESC);
CREATE INDEX pos_sales_customer_idx ON app.pos_sales(customer_id, completed_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX pos_sale_items_product_idx ON app.pos_sale_items(product_id, created_at DESC);
CREATE INDEX pos_sale_payments_sale_idx ON app.pos_sale_payments(sale_id, received_at);

ALTER TABLE app.pos_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_registers FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_sales FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pos_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_sale_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY pos_registers_read ON app.pos_registers FOR SELECT USING (app.has_role('owner','admin','cashier','finance','warehouse'));
CREATE POLICY pos_registers_manage ON app.pos_registers FOR ALL USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY pos_sales_read ON app.pos_sales FOR SELECT USING (
  app.has_role('owner','admin','finance') OR (app.has_role('cashier') AND cashier_id = app.current_app_user_id())
);
CREATE POLICY pos_sales_insert ON app.pos_sales FOR INSERT WITH CHECK (app.has_role('owner','admin','cashier') AND cashier_id = app.current_app_user_id());
CREATE POLICY pos_sales_void ON app.pos_sales FOR UPDATE USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY pos_sale_items_read ON app.pos_sale_items FOR SELECT USING (
  app.has_role('owner','admin','finance') OR (
    app.has_role('cashier') AND EXISTS (
      SELECT 1 FROM app.pos_sales s WHERE s.id = sale_id AND s.cashier_id = app.current_app_user_id()
    )
  )
);
CREATE POLICY pos_sale_items_insert ON app.pos_sale_items FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND EXISTS (
    SELECT 1 FROM app.pos_sales s WHERE s.id = sale_id AND s.cashier_id = app.current_app_user_id()
  )
);
CREATE POLICY pos_sale_payments_read ON app.pos_sale_payments FOR SELECT USING (
  app.has_role('owner','admin','finance') OR (
    app.has_role('cashier') AND EXISTS (
      SELECT 1 FROM app.pos_sales s WHERE s.id = sale_id AND s.cashier_id = app.current_app_user_id()
    )
  )
);
CREATE POLICY pos_sale_payments_insert ON app.pos_sale_payments FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND received_by = app.current_app_user_id() AND EXISTS (
    SELECT 1 FROM app.pos_sales s WHERE s.id = sale_id AND s.cashier_id = app.current_app_user_id()
  )
);
CREATE POLICY pos_sale_payments_reverse ON app.pos_sale_payments FOR UPDATE USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));

CREATE POLICY stock_movements_pos_insert ON app.stock_movements FOR INSERT WITH CHECK (
  actor_id = app.current_app_user_id() AND (
    (
      movement_type = 'adjustment_out' AND reference_type = 'pos_sale' AND EXISTS (
        SELECT 1 FROM app.pos_sales s
        WHERE s.id = reference_id AND s.cashier_id = app.current_app_user_id() AND s.status = 'completed'
      )
    ) OR (
      movement_type = 'return_in' AND reference_type = 'pos_void' AND app.has_role('owner','admin') AND EXISTS (
        SELECT 1 FROM app.pos_sales s WHERE s.id = reference_id AND s.status = 'voided'
      )
    )
  )
);

CREATE POLICY inventory_balances_pos_trigger_insert ON app.inventory_balances FOR INSERT WITH CHECK (
  app.has_role('cashier') AND pg_trigger_depth() > 0
);
CREATE POLICY inventory_balances_pos_trigger_update ON app.inventory_balances FOR UPDATE USING (
  app.has_role('cashier') AND pg_trigger_depth() > 0
) WITH CHECK (
  app.has_role('cashier') AND pg_trigger_depth() > 0
);

INSERT INTO app.permissions(code,description) VALUES
  ('pos.read','Membaca transaksi POS'),
  ('pos.sell','Membuat transaksi POS'),
  ('pos.void','Membatalkan transaksi POS')
ON CONFLICT (code) DO NOTHING;
INSERT INTO app.role_permissions(role,permission_code)
SELECT role, permission_code
FROM (VALUES
  ('owner'::app.user_role,'pos.read'),('owner'::app.user_role,'pos.sell'),('owner'::app.user_role,'pos.void'),
  ('admin'::app.user_role,'pos.read'),('admin'::app.user_role,'pos.sell'),('admin'::app.user_role,'pos.void'),
  ('cashier'::app.user_role,'pos.read'),('cashier'::app.user_role,'pos.sell'),
  ('finance'::app.user_role,'pos.read')
) AS grants(role,permission_code)
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON app.pos_registers, app.pos_sales, app.pos_sale_items, app.pos_sale_payments TO honda_runtime;
GRANT USAGE, SELECT ON SEQUENCE app.pos_sale_number_seq TO honda_runtime;

