import type { PoolClient } from "pg";
import { recordAudit } from "@/server/audit";

const AUTOMATION_LOCK = "automation:due-communications";
const AUDIT_ACTION = "automation.communication.provider_unavailable";

type Actor = { id: string; requestId: string };

type DueCommunication = {
  id: string;
  dueAt: string;
  channel: "phone" | "whatsapp" | "email" | "other";
  entityType: "customer_follow_up" | "service_reminder";
};

export type DueCommunicationResult = {
  status: "completed" | "busy";
  scanned: number;
  logged: number;
  alreadyLogged: number;
  deliveryStatus: "provider_unavailable";
};

async function loadDueItems(client: PoolClient, limit: number, now: Date) {
  const followUps = await client.query<DueCommunication>(
    `SELECT f.id,f.due_at AS "dueAt",f.channel,'customer_follow_up'::text AS "entityType"
     FROM app.customer_follow_ups f
     WHERE f.status='pending' AND f.due_at <= $1
       AND NOT EXISTS (SELECT 1 FROM app.audit_events a
         WHERE a.action='automation.communication.provider_unavailable'
           AND a.entity_type='customer_follow_up' AND a.entity_id=f.id
           AND (a.after_data->>'dueAt')::timestamptz=f.due_at)
     ORDER BY f.due_at,f.id
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [now.toISOString(), limit],
  );

  const remaining = limit - followUps.rows.length;
  if (remaining <= 0) return followUps.rows;

  const reminders = await client.query<DueCommunication>(
    `SELECT r.id,r.due_at AS "dueAt",'other'::text AS channel,'service_reminder'::text AS "entityType"
     FROM app.service_reminders r
     WHERE r.status='pending' AND r.due_at <= $1
       AND NOT EXISTS (SELECT 1 FROM app.audit_events a
         WHERE a.action='automation.communication.provider_unavailable'
           AND a.entity_type='service_reminder' AND a.entity_id=r.id
           AND (a.after_data->>'dueAt')::timestamptz=r.due_at)
     ORDER BY r.due_at,r.id
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [now.toISOString(), remaining],
  );
  return [...followUps.rows, ...reminders.rows];
}

export async function processDueCommunications(
  client: PoolClient,
  actor: Actor,
  options: { limit: number; now?: Date },
): Promise<DueCommunicationResult> {
  const lock = await client.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_xact_lock(hashtextextended($1::text,0)) AS acquired",
    [AUTOMATION_LOCK],
  );
  if (!lock.rows[0]?.acquired) {
    return { status: "busy", scanned: 0, logged: 0, alreadyLogged: 0, deliveryStatus: "provider_unavailable" };
  }

  const items = await loadDueItems(client, options.limit, options.now ?? new Date());
  let logged = 0;
  let alreadyLogged = 0;

  for (const item of items) {
    const existing = await client.query(
      `SELECT 1 FROM app.audit_events
       WHERE action=$1 AND entity_type=$2 AND entity_id=$3
         AND (after_data->>'dueAt')::timestamptz=$4::timestamptz
       LIMIT 1`,
      [AUDIT_ACTION, item.entityType, item.id, item.dueAt],
    );
    if (existing.rowCount) {
      alreadyLogged += 1;
      continue;
    }

    await recordAudit(client, {
      actorId: actor.id,
      requestId: actor.requestId,
      action: AUDIT_ACTION,
      entityType: item.entityType,
      entityId: item.id,
      after: {
        deliveryStatus: "provider_unavailable",
        channel: item.channel,
        dueAt: item.dueAt,
      },
    });
    logged += 1;
  }

  return {
    status: "completed",
    scanned: items.length,
    logged,
    alreadyLogged,
    deliveryStatus: "provider_unavailable",
  };
}

