import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { getOpenBillByCustomer, upsertOpenBill } from "@/features/pos/service";
import { openBillQuerySchema, openBillUpsertSchema } from "@/features/pos/schemas";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const input = openBillQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getOpenBillByCustomer(client, input.customerId));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.sell");
    const input = await parseBody(request, openBillUpsertSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => upsertOpenBill(client, { id: user.id, role: user.role, requestId }, input));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
