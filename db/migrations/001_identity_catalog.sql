CREATE SCHEMA IF NOT EXISTS app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app.user_role AS ENUM ('owner','admin','cashier','mechanic','warehouse','finance');
CREATE TYPE app.lifecycle_status AS ENUM ('active','inactive','discontinued');
CREATE TYPE app.service_status AS ENUM ('draft','open','assigned','in_progress','quality_check','invoiced','paid','completed','cancelled');

CREATE TABLE app.roles (
  code app.user_role PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.permissions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text NOT NULL
);
CREATE TABLE app.role_permissions (
  role app.user_role NOT NULL REFERENCES app.roles(code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES app.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);
CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 120),
  password_hash text NOT NULL,
  role app.user_role NOT NULL DEFAULT 'cashier',
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_active_idx ON app.sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  request_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON app.audit_events (entity_type, entity_id, created_at DESC);

CREATE TABLE app.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.vehicle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL DEFAULT 'Honda',
  name text NOT NULL,
  year_start smallint CHECK (year_start BETWEEN 1950 AND 2100),
  year_end smallint CHECK (year_end IS NULL OR year_end BETWEEN 1950 AND 2100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (year_end IS NULL OR year_start IS NULL OR year_end >= year_start),
  UNIQUE (brand, name, year_start)
);
CREATE TABLE app.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_code text NOT NULL,
  canonical_code text GENERATED ALWAYS AS (upper(regexp_replace(part_code, '[^A-Za-z0-9]', '', 'g'))) STORED,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 500),
  category_id uuid REFERENCES app.product_categories(id) ON DELETE SET NULL,
  het numeric(15,2) NOT NULL DEFAULT 0 CHECK (het >= 0),
  hpp numeric(15,2) NOT NULL DEFAULT 0 CHECK (hpp >= 0),
  unit text NOT NULL DEFAULT 'pcs' CHECK (char_length(trim(unit)) BETWEEN 1 AND 20),
  minimum_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  status app.lifecycle_status NOT NULL DEFAULT 'active',
  description text,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_code)
);
CREATE INDEX products_search_idx ON app.products USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(part_code,'')));
CREATE INDEX products_category_idx ON app.products (category_id, status);
CREATE TABLE app.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  barcode text NOT NULL CHECK (char_length(trim(barcode)) BETWEEN 3 AND 100),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barcode)
);
CREATE UNIQUE INDEX product_primary_barcode_idx ON app.product_barcodes(product_id) WHERE is_primary;
CREATE TABLE app.product_vehicle_compatibility (
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  vehicle_model_id uuid NOT NULL REFERENCES app.vehicle_models(id) ON DELETE CASCADE,
  notes text,
  PRIMARY KEY (product_id, vehicle_model_id)
);
CREATE TABLE app.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  price_type text NOT NULL CHECK (price_type IN ('het','hpp','sale')),
  amount numeric(15,2) NOT NULL CHECK (amount >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > effective_at)
);
CREATE INDEX product_prices_current_idx ON app.product_prices(product_id, price_type, effective_at DESC) WHERE ended_at IS NULL;

CREATE TABLE app.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX customers_phone_unique_idx ON app.customers(phone) WHERE phone IS NOT NULL;
CREATE TABLE app.customer_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  vehicle_model_id uuid REFERENCES app.vehicle_models(id) ON DELETE SET NULL,
  plate_number text NOT NULL,
  canonical_plate text GENERATED ALWAYS AS (upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g'))) STORED,
  year smallint CHECK (year BETWEEN 1950 AND 2100),
  vin text,
  engine_number text,
  odometer numeric(14,1) NOT NULL DEFAULT 0 CHECK (odometer >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_plate)
);
CREATE INDEX customer_vehicles_customer_idx ON app.customer_vehicles(customer_id);

CREATE TABLE app.mechanics (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  employee_code text NOT NULL UNIQUE,
  fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (fee_percent BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES app.customer_vehicles(id) ON DELETE RESTRICT,
  assigned_mechanic_id uuid REFERENCES app.mechanics(user_id) ON DELETE SET NULL,
  status app.service_status NOT NULL DEFAULT 'draft',
  complaint text NOT NULL CHECK (char_length(trim(complaint)) BETWEEN 2 AND 2000),
  diagnosis text,
  odometer numeric(14,1) CHECK (odometer >= 0),
  opened_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR opened_at IS NULL OR completed_at >= opened_at)
);
CREATE INDEX service_orders_status_idx ON app.service_orders(status, created_at DESC);
CREATE INDEX service_orders_mechanic_idx ON app.service_orders(assigned_mechanic_id, status);
CREATE TABLE app.service_order_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 300),
  description text,
  price numeric(15,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  mechanic_id uuid REFERENCES app.mechanics(user_id) ON DELETE SET NULL,
  status app.service_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.service_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES app.service_orders(id) ON DELETE CASCADE,
  from_status app.service_status,
  to_status app.service_status NOT NULL,
  reason text,
  actor_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
