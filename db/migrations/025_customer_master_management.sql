ALTER TABLE app.customers
  ADD COLUMN normalized_phone text,
  ADD COLUMN normalized_email text,
  ADD COLUMN merged_into_id uuid REFERENCES app.customers(id) ON DELETE RESTRICT,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT customers_merge_state_valid CHECK (
    merged_into_id IS NULL OR (
      merged_into_id <> id AND is_active=false
      AND normalized_phone IS NULL AND normalized_email IS NULL
    )
  );

WITH ranked AS (
  SELECT id,
    CASE
      WHEN regexp_replace(COALESCE(phone,''),'[^0-9]','','g') LIKE '0%'
        THEN '62' || substr(regexp_replace(phone,'[^0-9]','','g'),2)
      WHEN regexp_replace(COALESCE(phone,''),'[^0-9]','','g') LIKE '8%'
        THEN '62' || regexp_replace(phone,'[^0-9]','','g')
      ELSE NULLIF(regexp_replace(COALESCE(phone,''),'[^0-9]','','g'),'')
    END AS phone_value,
    NULLIF(lower(trim(COALESCE(email,''))),'') AS email_value
  FROM app.customers
), deduplicated AS (
  SELECT id,phone_value,email_value,
    row_number() OVER (PARTITION BY phone_value ORDER BY id) AS phone_rank,
    row_number() OVER (PARTITION BY email_value ORDER BY id) AS email_rank
  FROM ranked
)
UPDATE app.customers c SET
  normalized_phone=CASE WHEN d.phone_value IS NOT NULL AND d.phone_rank=1 THEN d.phone_value END,
  normalized_email=CASE WHEN d.email_value IS NOT NULL AND d.email_rank=1 THEN d.email_value END
FROM deduplicated d WHERE d.id=c.id;

CREATE UNIQUE INDEX customers_normalized_phone_unique_idx ON app.customers(normalized_phone)
  WHERE normalized_phone IS NOT NULL AND merged_into_id IS NULL;
CREATE UNIQUE INDEX customers_normalized_email_unique_idx ON app.customers(normalized_email)
  WHERE normalized_email IS NOT NULL AND merged_into_id IS NULL;
DROP INDEX app.customers_phone_unique_idx;
CREATE INDEX customers_merged_into_idx ON app.customers(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX customers_search_name_idx ON app.customers(lower(name));

CREATE TABLE app.customer_merge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  target_customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  merged_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  merged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_customer_id <> target_customer_id)
);

CREATE TABLE app.vehicle_ownership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES app.customer_vehicles(id) ON DELETE RESTRICT,
  previous_customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  new_customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  transferred_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_customer_id <> new_customer_id)
);

ALTER TABLE app.customer_merge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_merge_history FORCE ROW LEVEL SECURITY;
ALTER TABLE app.vehicle_ownership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vehicle_ownership_history FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_merge_history_read ON app.customer_merge_history FOR SELECT USING (app.is_authenticated());
CREATE POLICY customer_merge_history_insert ON app.customer_merge_history FOR INSERT WITH CHECK (
  app.has_role('owner','admin') AND merged_by=app.current_app_user_id()
);
CREATE POLICY vehicle_ownership_history_read ON app.vehicle_ownership_history FOR SELECT USING (app.is_authenticated());
CREATE POLICY vehicle_ownership_history_insert ON app.vehicle_ownership_history FOR INSERT WITH CHECK (
  app.has_role('owner','admin','cashier') AND transferred_by=app.current_app_user_id()
);

CREATE POLICY service_order_feedback_admin_merge ON app.service_order_feedback
  FOR UPDATE USING (app.has_role('owner','admin')) WITH CHECK (app.has_role('owner','admin'));

DROP POLICY customers_insert ON app.customers;
DROP POLICY customers_update ON app.customers;
DROP POLICY customer_vehicles_insert ON app.customer_vehicles;
DROP POLICY customer_vehicles_update ON app.customer_vehicles;
CREATE POLICY customers_insert ON app.customers FOR INSERT WITH CHECK (app.has_role('owner','admin','cashier'));
CREATE POLICY customers_update ON app.customers FOR UPDATE USING (app.has_role('owner','admin','cashier')) WITH CHECK (app.has_role('owner','admin','cashier'));
CREATE POLICY customer_vehicles_insert ON app.customer_vehicles FOR INSERT WITH CHECK (app.has_role('owner','admin','cashier'));
CREATE POLICY customer_vehicles_update ON app.customer_vehicles FOR UPDATE USING (app.has_role('owner','admin','cashier')) WITH CHECK (app.has_role('owner','admin','cashier'));

GRANT SELECT, INSERT ON app.customer_merge_history TO honda_runtime;
GRANT SELECT, INSERT ON app.vehicle_ownership_history TO honda_runtime;
