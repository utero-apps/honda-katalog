ALTER TABLE app.payments ADD COLUMN reversed_at timestamptz;
ALTER TABLE app.payments ADD COLUMN reversed_by uuid REFERENCES app.users(id) ON DELETE SET NULL;
ALTER TABLE app.payments ADD COLUMN reversal_reason text;
ALTER TABLE app.expenses ADD COLUMN reversed_at timestamptz;
ALTER TABLE app.expenses ADD COLUMN reversed_by uuid REFERENCES app.users(id) ON DELETE SET NULL;
ALTER TABLE app.expenses ADD COLUMN reversal_reason text;
CREATE INDEX payments_active_idx ON app.payments(paid_at) WHERE reversed_at IS NULL;
CREATE INDEX expenses_active_idx ON app.expenses(occurred_at) WHERE reversed_at IS NULL;
