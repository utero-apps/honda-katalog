import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { cancelOpenBill } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok } from "@/server/http";

const idSchema = z.uuid();

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.sell");
    const id = idSchema.parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => cancelOpenBill(client, { id: user.id, role: user.role, requestId }, id));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
