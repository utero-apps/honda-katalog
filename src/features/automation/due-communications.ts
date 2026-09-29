import crypto from "node:crypto";
import type { PoolClient } from "pg";

type Message = { id:string; idempotencyKey:string; channel:"email"|"whatsapp"; destination:string; payload:Record<string,unknown>; attempts:number; maxAttempts:number };
export type DueCommunicationResult = { status:"completed"|"busy"; enqueued:number; claimed:number; delivered:number; retried:number; dead:number; providerUnavailable:number };

function provider(channel: Message["channel"]) {
  const prefix = channel === "email" ? "AUTOMATION_EMAIL" : "AUTOMATION_WHATSAPP";
  const value = process.env[`${prefix}_PROVIDER_URL`]?.trim();
  if (!value) return null;
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
  return { url, token: process.env[`${prefix}_PROVIDER_TOKEN`]?.trim() };
}

async function send(message: Message) {
  const config = provider(message.channel);
  if (!config) return { ok:false as const, code:"provider_unavailable", retryable:true };
  try {
    const response = await fetch(config.url, { method:"POST", signal:AbortSignal.timeout(10_000), headers:{ "content-type":"application/json", "idempotency-key":message.idempotencyKey, ...(config.token ? { authorization:`Bearer ${config.token}` } : {}) }, body:JSON.stringify({ channel:message.channel, to:message.destination, message:message.payload }) });
    if (!response.ok) return { ok:false as const, code:`provider_http_${response.status}`, retryable:response.status === 429 || response.status >= 500 };
    const body = await response.json().catch(() => ({})) as { id?:unknown };
    return { ok:true as const, id:typeof body.id === "string" ? body.id.slice(0,240) : null };
  } catch { return { ok:false as const, code:"provider_request_failed", retryable:true }; }
}

export async function processDueCommunications(client:PoolClient, options:{limit:number; now?:Date; workerId?:string}):Promise<DueCommunicationResult> {
  const now = options.now ?? new Date(); const workerId = options.workerId ?? crypto.randomUUID();
  const lock = await client.query<{acquired:boolean}>("SELECT pg_try_advisory_xact_lock(hashtextextended($1::text,0)) AS acquired", ["automation:due-communications"]);
  const zero = { enqueued:0, claimed:0, delivered:0, retried:0, dead:0, providerUnavailable:0 };
  if (!lock.rows[0]?.acquired) return { status:"busy", ...zero };
  const queued = await client.query(`WITH due AS (
    SELECT f.id,'customer_follow_up'::text entity_type,f.due_at,f.channel,c.phone,c.email,c.name,NULL::text plate_number FROM app.customer_follow_ups f JOIN app.customers c ON c.id=f.customer_id WHERE f.status='pending' AND f.due_at<=$1 AND ((f.channel='email' AND c.email IS NOT NULL) OR (f.channel='whatsapp' AND c.phone IS NOT NULL))
    UNION ALL SELECT r.id,'service_reminder',r.due_at,CASE WHEN c.phone IS NOT NULL THEN 'whatsapp' ELSE 'email' END,c.phone,c.email,c.name,v.plate_number FROM app.service_reminders r JOIN app.customers c ON c.id=r.customer_id JOIN app.customer_vehicles v ON v.id=r.vehicle_id WHERE r.status='pending' AND r.due_at<=$1 AND (c.phone IS NOT NULL OR c.email IS NOT NULL) ORDER BY due_at,id LIMIT $2)
    INSERT INTO app.automation_outbox(idempotency_key,entity_type,entity_id,channel,destination,payload,next_attempt_at)
    SELECT entity_type||':'||id::text||':'||extract(epoch FROM due_at)::text,entity_type,id,channel,CASE WHEN channel='email' THEN email ELSE phone END,jsonb_strip_nulls(jsonb_build_object('kind',entity_type,'customerName',name,'dueAt',due_at,'plateNumber',plate_number)),$1 FROM due ON CONFLICT(idempotency_key) DO NOTHING`, [now.toISOString(), options.limit]);
  const claimed = await client.query<Message>(`WITH c AS (SELECT id FROM app.automation_outbox WHERE (status IN ('pending','retry') AND next_attempt_at<=$1) OR (status='processing' AND locked_at<$1::timestamptz-interval '10 minutes') ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE app.automation_outbox o SET status='processing',locked_at=$1,locked_by=$3 FROM c WHERE o.id=c.id RETURNING o.id,o.idempotency_key "idempotencyKey",o.channel,o.destination,o.payload,o.attempts,o.max_attempts "maxAttempts"`, [now.toISOString(), options.limit, workerId]);
  const counts = { delivered:0, retried:0, dead:0, providerUnavailable:0 };
  for (const message of claimed.rows) {
    const result = await send(message);
    if (result.ok) { await client.query("UPDATE app.automation_outbox SET status='delivered',attempts=attempts+1,delivered_at=$2,provider_message_id=$3,locked_at=NULL,locked_by=NULL,last_error_code=NULL WHERE id=$1 AND locked_by=$4", [message.id,now.toISOString(),result.id,workerId]); counts.delivered++; continue; }
    const attempts=message.attempts+1; const dead=!result.retryable||attempts>=message.maxAttempts; const delay=Math.min(21600,30*2**Math.min(attempts-1,10))+crypto.randomInt(0,31);
    await client.query("UPDATE app.automation_outbox SET status=$2,attempts=$3,next_attempt_at=$4,last_error_code=$5,locked_at=NULL,locked_by=NULL WHERE id=$1 AND locked_by=$6", [message.id,dead?"dead":"retry",attempts,new Date(now.getTime()+delay*1000).toISOString(),result.code,workerId]);
    if(result.code==="provider_unavailable") counts.providerUnavailable++; if(dead) counts.dead++; else counts.retried++;
  }
  return { status:"completed", enqueued:queued.rowCount??0, claimed:claimed.rows.length, ...counts };
}
