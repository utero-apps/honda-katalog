-- 1. Grant schema usage permissions to public, anon, and authenticated roles
GRANT USAGE ON SCHEMA honda TO anon;
GRANT USAGE ON SCHEMA honda TO authenticated;
GRANT USAGE ON SCHEMA honda TO service_role;

-- 2. Grant CRUD permissions on spareparts in honda schema to these roles
GRANT SELECT, INSERT, UPDATE ON TABLE honda.spareparts TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE honda.spareparts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE honda.spareparts TO service_role;

-- 3. Grant execute permissions on all functions in honda schema
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA honda TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA honda TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA honda TO service_role;

-- 4. Disable RLS (Row Level Security) on the spareparts table for simplicity
ALTER TABLE honda.spareparts DISABLE ROW LEVEL SECURITY;
