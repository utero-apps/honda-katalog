import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { createOrderSchema } from "@/features/service-reception/schemas";
import { createReceptionOrder } from "@/features/service-reception/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.create");
    const input = await parseBody(request, createOrderSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => createReceptionOrder(client, { id: user.id, requestId }, input));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
