import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "audit.read");
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => (await client.query("SELECT id,action,entity_type AS \"entityType\",entity_id AS \"entityId\",request_id AS \"requestId\",created_at AS \"createdAt\" FROM app.audit_events ORDER BY created_at DESC LIMIT 200")).rows);
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
