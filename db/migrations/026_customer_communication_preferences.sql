ALTER TABLE app.customers
  ADD COLUMN communication_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN preferred_channel text NOT NULL DEFAULT 'phone'
    CHECK (preferred_channel IN ('phone','whatsapp','email')),
  ADD COLUMN consent_updated_at timestamptz,
  ADD COLUMN consent_updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL;

ALTER TABLE app.customers
  ADD CONSTRAINT customers_communication_channel_available CHECK (
    communication_consent=false
    OR (preferred_channel='email' AND normalized_email IS NOT NULL)
    OR (preferred_channel IN ('phone','whatsapp') AND normalized_phone IS NOT NULL)
  );
