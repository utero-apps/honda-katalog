CREATE TABLE app.automation_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 idempotency_key text NOT NULL UNIQUE,
 entity_type text NOT NULL CHECK (entity_type IN ('customer_follow_up','service_reminder')),
 entity_id uuid NOT NULL,
 channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
 destination text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','delivered','dead')),
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 8,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 locked_by text,
 delivered_at timestamptz,
 provider_message_id text,
 last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_outbox_due_idx ON app.automation_outbox(next_attempt_at) WHERE status IN ('pending','retry','processing');
ALTER TABLE app.automation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.automation_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.automation_outbox FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON app.automation_outbox TO honda_runtime;
CREATE POLICY automation_outbox_system ON app.automation_outbox FOR ALL USING (app.is_system_auth()) WITH CHECK (app.is_system_auth());
CREATE POLICY automation_outbox_admin_read ON app.automation_outbox FOR SELECT USING (app.has_role('owner','admin'));
