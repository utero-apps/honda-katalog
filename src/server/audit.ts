import type { PoolClient } from "pg";

export async function recordAudit(client: PoolClient, input: { actorId: string; requestId: string; action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown }) {
  await client.query("INSERT INTO app.audit_events(actor_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)", [input.actorId, input.action, input.entityType, input.entityId ?? null, input.requestId, input.before ? JSON.stringify(input.before) : null, input.after ? JSON.stringify(input.after) : null]);
}
