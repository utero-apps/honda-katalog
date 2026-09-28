UPDATE app.customer_vehicles
SET plate_number = upper(trim(plate_number))
WHERE plate_number <> upper(trim(plate_number));

CREATE OR REPLACE FUNCTION app.normalize_customer_vehicle_plate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.plate_number := upper(trim(NEW.plate_number));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_vehicles_uppercase_plate ON app.customer_vehicles;
CREATE TRIGGER customer_vehicles_uppercase_plate
BEFORE INSERT OR UPDATE OF plate_number ON app.customer_vehicles
FOR EACH ROW EXECUTE FUNCTION app.normalize_customer_vehicle_plate();
