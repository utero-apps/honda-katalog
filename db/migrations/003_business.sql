CREATE TYPE app.purchase_status AS ENUM ('draft','submitted','approved','partially_received','received','closed','rejected','cancelled');
CREATE TYPE app.invoice_status AS ENUM ('draft','posted','partially_paid','paid','reversed');
CREATE TYPE app.payment_direction AS ENUM ('incoming','outgoing');

CREATE TABLE app.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days BETWEEN 0 AND 365),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.vendor_products (
  vendor_id uuid NOT NULL REFERENCES app.vendors(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  vendor_part_code text,
  last_price numeric(15,2) NOT NULL DEFAULT 0 CHECK (last_price >= 0),
  lead_time_days integer NOT NULL DEFAULT 0 CHECK (lead_time_days BETWEEN 0 AND 365),
  PRIMARY KEY(vendor_id, product_id)
);
CREATE TABLE app.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES app.vendors(id) ON DELETE RESTRICT,
  status app.purchase_status NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT current_date,
  expected_date date,
  notes text,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_date IS NULL OR expected_date >= order_date)
);
CREATE TABLE app.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES app.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  ordered_quantity numeric(14,3) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  UNIQUE(purchase_order_id, product_id)
);
CREATE TABLE app.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES app.purchase_orders(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  received_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  idempotency_key text NOT NULL UNIQUE
);
CREATE TABLE app.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES app.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES app.purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(15,2) NOT NULL CHECK (unit_cost >= 0),
  UNIQUE(goods_receipt_id, purchase_order_item_id)
);

CREATE TABLE app.customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  service_order_id uuid UNIQUE REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  status app.invoice_status NOT NULL DEFAULT 'draft',
  subtotal numeric(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount numeric(15,2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= subtotal),
  tax numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total numeric(15,2) GENERATED ALWAYS AS (subtotal - discount + tax) STORED,
  issued_at timestamptz,
  due_at timestamptz,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.customer_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES app.customer_invoices(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('service','product','other')),
  reference_id uuid,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE TABLE app.vendor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES app.vendors(id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES app.purchase_orders(id) ON DELETE RESTRICT,
  status app.invoice_status NOT NULL DEFAULT 'draft',
  total numeric(15,2) NOT NULL CHECK (total >= 0),
  issued_at date NOT NULL,
  due_at date,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, invoice_number)
);
CREATE TABLE app.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE,
  direction app.payment_direction NOT NULL,
  customer_invoice_id uuid REFERENCES app.customer_invoices(id) ON DELETE RESTRICT,
  vendor_invoice_id uuid REFERENCES app.vendor_invoices(id) ON DELETE RESTRICT,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','transfer','card','other')),
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((direction = 'incoming' AND customer_invoice_id IS NOT NULL AND vendor_invoice_id IS NULL) OR
         (direction = 'outgoing' AND vendor_invoice_id IS NOT NULL AND customer_invoice_id IS NULL))
);
CREATE TABLE app.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.mechanic_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id uuid NOT NULL REFERENCES app.mechanics(user_id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE RESTRICT,
  base_amount numeric(15,2) NOT NULL CHECK (base_amount >= 0),
  percentage numeric(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  fee_amount numeric(15,2) GENERATED ALWAYS AS (base_amount * percentage / 100) STORED,
  approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mechanic_id, service_order_id)
);

CREATE TABLE app.customer_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  service_order_id uuid REFERENCES app.service_orders(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL,
  channel text NOT NULL CHECK (channel IN ('phone','whatsapp','email','other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  notes text,
  assigned_to uuid REFERENCES app.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.service_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES app.customer_vehicles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  odometer_due numeric(14,1) CHECK (odometer_due >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchase_orders_vendor_idx ON app.purchase_orders(vendor_id, status);
CREATE INDEX vendor_invoices_due_idx ON app.vendor_invoices(status, due_at);
CREATE INDEX customer_invoices_due_idx ON app.customer_invoices(status, due_at);
CREATE INDEX follow_ups_due_idx ON app.customer_follow_ups(status, due_at);
CREATE INDEX service_reminders_due_idx ON app.service_reminders(status, due_at);
