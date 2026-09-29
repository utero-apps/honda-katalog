import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { customerCsv } from "@/features/customer-management/csv";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "users.manage");
    const rows = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => (
      await client.query(`SELECT c.id,c.name,c.phone,c.email,c.address,c.is_active AS "isActive",
        v.plate_number AS "plateNumber",m.name AS model,v.year,v.odometer::text,
        (SELECT max(s.completed_at) FROM app.service_orders s WHERE s.vehicle_id=v.id) AS "lastServiceAt"
        FROM app.customers c LEFT JOIN app.customer_vehicles v ON v.customer_id=c.id
        LEFT JOIN app.vehicle_models m ON m.id=v.vehicle_model_id
        WHERE c.merged_into_id IS NULL ORDER BY c.id,v.plate_number LIMIT 10000`)
    ).rows);
    return new Response(customerCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=customer-vehicles.csv",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      },
    });
  } catch (error) { return fail(error); }
}
