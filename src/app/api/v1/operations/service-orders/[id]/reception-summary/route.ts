import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServiceOrderReceptionSummary } from "@/features/service-order-reception-summary/queries";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const serviceOrderId = z.uuid().parse((await context.params).id);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      (client) => getServiceOrderReceptionSummary(client, serviceOrderId),
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
