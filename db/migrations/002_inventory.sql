CREATE TYPE app.stock_movement_type AS ENUM ('opening','receiving','service_usage','adjustment_in','adjustment_out','opname','return_in','return_out');
CREATE TYPE app.opname_status AS ENUM ('draft','counting','posted','cancelled');

CREATE TABLE app.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.inventory_balances (
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);
CREATE INDEX inventory_balances_product_idx ON app.inventory_balances(product_id);
CREATE TABLE app.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  movement_type app.stock_movement_type NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity <> 0),
  unit_cost numeric(15,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference_type text NOT NULL,
  reference_id uuid,
  idempotency_key text UNIQUE,
  reason text,
  actor_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_lookup_idx ON app.stock_movements(warehouse_id, product_id, occurred_at DESC);
CREATE INDEX stock_movements_reference_idx ON app.stock_movements(reference_type, reference_id);

CREATE TABLE app.service_order_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost numeric(15,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_order_id, product_id, warehouse_id)
);
CREATE TABLE app.quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL UNIQUE REFERENCES app.service_orders(id) ON DELETE CASCADE,
  checked_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  passed boolean NOT NULL,
  notes text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.stock_opnames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_number text NOT NULL UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  status app.opname_status NOT NULL DEFAULT 'draft',
  notes text,
  started_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  posted_by uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz
);
CREATE TABLE app.stock_opname_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_opname_id uuid NOT NULL REFERENCES app.stock_opnames(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  system_quantity numeric(14,3) NOT NULL CHECK (system_quantity >= 0),
  counted_quantity numeric(14,3) CHECK (counted_quantity >= 0),
  notes text,
  UNIQUE(stock_opname_id, product_id)
);

CREATE OR REPLACE FUNCTION app.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_quantity numeric(14,3);
BEGIN
  INSERT INTO app.inventory_balances(warehouse_id, product_id, quantity)
  VALUES (NEW.warehouse_id, NEW.product_id, 0)
  ON CONFLICT (warehouse_id, product_id) DO NOTHING;

  SELECT quantity + NEW.quantity INTO new_quantity
  FROM app.inventory_balances
  WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id
  FOR UPDATE;

  IF new_quantity < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  UPDATE app.inventory_balances
  SET quantity = new_quantity, updated_at = now()
  WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movement_apply
AFTER INSERT ON app.stock_movements
FOR EACH ROW EXECUTE FUNCTION app.apply_stock_movement();

CREATE OR REPLACE FUNCTION app.prevent_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'STOCK_MOVEMENTS_ARE_IMMUTABLE';
END;
$$;
CREATE TRIGGER stock_movement_no_update BEFORE UPDATE OR DELETE ON app.stock_movements
FOR EACH ROW EXECUTE FUNCTION app.prevent_stock_movement_mutation();
