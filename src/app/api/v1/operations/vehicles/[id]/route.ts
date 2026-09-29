import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { vehicleUpdateSchema } from "@/features/customer-management/schemas";
import { updateVehicle } from "@/features/customer-management/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.create");
    const id = z.uuid().parse((await context.params).id);
    const body = await parseBody(request, vehicleUpdateSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => updateVehicle(client, { id: user.id, role: user.role, requestId }, id, body));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
