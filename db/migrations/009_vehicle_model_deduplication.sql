WITH ranked AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY brand, name, year_start
    ORDER BY created_at, id
  ) AS keeper_id
  FROM app.vehicle_models
), duplicates AS (
  SELECT id, keeper_id FROM ranked WHERE id <> keeper_id
)
INSERT INTO app.product_vehicle_compatibility(product_id, vehicle_model_id)
SELECT DISTINCT compatibility.product_id, duplicates.keeper_id
FROM app.product_vehicle_compatibility compatibility
JOIN duplicates ON duplicates.id = compatibility.vehicle_model_id
ON CONFLICT DO NOTHING;

WITH ranked AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY brand, name, year_start
    ORDER BY created_at, id
  ) AS keeper_id
  FROM app.vehicle_models
)
UPDATE app.customer_vehicles vehicle
SET vehicle_model_id = ranked.keeper_id
FROM ranked
WHERE vehicle.vehicle_model_id = ranked.id
  AND ranked.id <> ranked.keeper_id;

WITH ranked AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY brand, name, year_start
    ORDER BY created_at, id
  ) AS keeper_id
  FROM app.vehicle_models
)
DELETE FROM app.product_vehicle_compatibility compatibility
USING ranked
WHERE compatibility.vehicle_model_id = ranked.id
  AND ranked.id <> ranked.keeper_id;

WITH ranked AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY brand, name, year_start
    ORDER BY created_at, id
  ) AS keeper_id
  FROM app.vehicle_models
)
DELETE FROM app.vehicle_models model
USING ranked
WHERE model.id = ranked.id
  AND ranked.id <> ranked.keeper_id;

ALTER TABLE app.vehicle_models
  DROP CONSTRAINT IF EXISTS vehicle_models_brand_name_year_start_key;

ALTER TABLE app.vehicle_models
  ADD CONSTRAINT vehicle_models_brand_name_year_start_key
  UNIQUE NULLS NOT DISTINCT (brand, name, year_start);
