import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getVehicleServiceHistory } from "@/features/service-history/queries";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const vehicleId = z.uuid().parse((await context.params).id);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      (client) => getVehicleServiceHistory(client, vehicleId),
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
