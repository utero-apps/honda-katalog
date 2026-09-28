ALTER TABLE app.products
  ADD COLUMN image_url text;

ALTER TABLE app.products
  ADD CONSTRAINT products_image_url_check
  CHECK (image_url IS NULL OR (char_length(image_url) <= 2_000 AND image_url ~ '^(https?://|/)'));

CREATE TABLE app.pos_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{2,80}$'),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
  description text,
  fixed_price numeric(15,2) NOT NULL CHECK (fixed_price > 0),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.pos_services(code,name,fixed_price,sort_order) VALUES
  ('GANTI_OLI','Ganti Oli',60000,1),
  ('SERVIS_RINGAN','Servis Ringan',85000,2),
  ('SERVIS_LENGKAP','Servis Lengkap',175000,3),
  ('GANTI_SPAREPART','Ganti Sparepart',25000,4)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, fixed_price=EXCLUDED.fixed_price, sort_order=EXCLUDED.sort_order, is_active=true, updated_at=now();

ALTER TABLE app.pos_sale_items
  ADD COLUMN service_id uuid REFERENCES app.pos_services(id) ON DELETE RESTRICT,
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE app.pos_sale_items
  ADD CONSTRAINT pos_sale_items_item_source_check
  CHECK ((product_id IS NOT NULL)::integer + (service_id IS NOT NULL)::integer = 1);

CREATE UNIQUE INDEX pos_sale_items_sale_service_unique ON app.pos_sale_items(sale_id,service_id) WHERE service_id IS NOT NULL;

CREATE TABLE app.pos_open_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  register_id uuid NOT NULL REFERENCES app.pos_registers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','converted','cancelled')),
  notes text,
  created_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  converted_sale_id uuid REFERENCES app.pos_sales(id) ON DELETE RESTRICT,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open' AND converted_sale_id IS NULL AND converted_at IS NULL)
    OR (status = 'converted' AND converted_sale_id IS NOT NULL AND converted_at IS NOT NULL)
    OR (status = 'cancelled' AND converted_sale_id IS NULL AND converted_at IS NULL))
);

CREATE UNIQUE INDEX pos_open_bills_one_open_customer ON app.pos_open_bills(customer_id) WHERE status='open';
CREATE INDEX pos_open_bills_customer_idx ON app.pos_open_bills(customer_id,updated_at DESC);

CREATE TABLE app.pos_open_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_bill_id uuid NOT NULL REFERENCES app.pos_open_bills(id) ON DELETE CASCADE,
  product_id uuid REFERENCES app.products(id) ON DELETE RESTRICT,
  service_id uuid REFERENCES app.pos_services(id) ON DELETE RESTRICT,
  item_code text NOT NULL,
  item_name text NOT NULL,
  unit text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  discount numeric(15,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total numeric(15,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((product_id IS NOT NULL)::integer + (service_id IS NOT NULL)::integer = 1),
  CHECK (discount <= round(quantity * unit_price, 2))
);

CREATE UNIQUE INDEX pos_open_bill_items_product_unique ON app.pos_open_bill_items(open_bill_id,product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX pos_open_bill_items_service_unique ON app.pos_open_bill_items(open_bill_id,service_id) WHERE service_id IS NOT NULL;

ALTER TABLE app.pos_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_services FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pos_open_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_open_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pos_open_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pos_open_bill_items FORCE ROW LEVEL SECURITY;

CREATE POLICY pos_services_read ON app.pos_services FOR SELECT USING (app.has_role('owner','admin','cashier','finance'));
CREATE POLICY pos_services_manage ON app.pos_services FOR ALL USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));
CREATE POLICY pos_open_bills_read ON app.pos_open_bills FOR SELECT USING (app.has_role('owner','admin','cashier'));
CREATE POLICY pos_open_bills_insert ON app.pos_open_bills FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND created_by=app.current_app_user_id() AND updated_by=app.current_app_user_id()
);
CREATE POLICY pos_open_bills_update ON app.pos_open_bills FOR UPDATE USING (app.has_role('owner','admin','cashier')) WITH CHECK (
  app.has_role('owner','admin','cashier') AND updated_by=app.current_app_user_id()
);
CREATE POLICY pos_open_bills_delete ON app.pos_open_bills FOR DELETE USING (app.has_role('owner','admin','cashier'));
CREATE POLICY pos_open_bill_items_read ON app.pos_open_bill_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM app.pos_open_bills b WHERE b.id=open_bill_id AND app.has_role('owner','admin','cashier'))
);
CREATE POLICY pos_open_bill_items_insert ON app.pos_open_bill_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM app.pos_open_bills b WHERE b.id=open_bill_id AND app.has_role('owner','admin','cashier'))
);
CREATE POLICY pos_open_bill_items_update ON app.pos_open_bill_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM app.pos_open_bills b WHERE b.id=open_bill_id AND app.has_role('owner','admin','cashier'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM app.pos_open_bills b WHERE b.id=open_bill_id AND app.has_role('owner','admin','cashier'))
);
CREATE POLICY pos_open_bill_items_delete ON app.pos_open_bill_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM app.pos_open_bills b WHERE b.id=open_bill_id AND app.has_role('owner','admin','cashier'))
);

CREATE OR REPLACE FUNCTION app.enforce_pos_open_bill_actor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'created_by cannot be changed';
  END IF;
  IF NEW.updated_by <> app.current_app_user_id() THEN
    RAISE EXCEPTION 'updated_by must match current actor';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pos_open_bills_actor_guard
BEFORE INSERT OR UPDATE ON app.pos_open_bills
FOR EACH ROW EXECUTE FUNCTION app.enforce_pos_open_bill_actor();

GRANT SELECT, INSERT, UPDATE, DELETE ON app.pos_services, app.pos_open_bills, app.pos_open_bill_items TO honda_runtime;
GRANT EXECUTE ON FUNCTION app.enforce_pos_open_bill_actor() TO honda_runtime;
