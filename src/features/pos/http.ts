import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { checkoutSchema } from "@/features/pos/schemas";
import { checkout } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export async function handleCheckout(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.sell");
    const input = await parseBody(request, checkoutSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => checkout(client, { id: user.id, role: user.role, requestId }, input));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
