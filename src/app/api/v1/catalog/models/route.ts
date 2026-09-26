import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.read");
    const models = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const result = await client.query<{ id: string; name: string }>("SELECT id,name FROM app.vehicle_models WHERE is_active=true ORDER BY name");
      return result.rows;
    });
    return ok(models, { requestId });
  } catch (error) {
    return fail(error);
  }
}
