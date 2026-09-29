ALTER TABLE app.customer_follow_ups ADD COLUMN automation_key text;
ALTER TABLE app.service_reminders ADD COLUMN automation_key text;

CREATE UNIQUE INDEX customer_follow_ups_automation_key_idx
  ON app.customer_follow_ups(automation_key);

CREATE UNIQUE INDEX service_reminders_automation_key_idx
  ON app.service_reminders(automation_key);
