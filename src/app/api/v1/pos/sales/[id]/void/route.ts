import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { voidSaleSchema } from "@/features/pos/schemas";
import { voidSale } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.void");
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, voidSaleSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => voidSale(client, { id: user.id, role: user.role, requestId }, id, input.reason));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
