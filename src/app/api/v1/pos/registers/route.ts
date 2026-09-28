import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => (
      await client.query(`SELECT r.id,r.code,r.name,r.warehouse_id AS "warehouseId",w.name AS "warehouseName"
        FROM app.pos_registers r JOIN app.warehouses w ON w.id=r.warehouse_id WHERE r.is_active=true ORDER BY r.code`)
    ).rows);
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
