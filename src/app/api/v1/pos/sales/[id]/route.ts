import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSale } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const id = z.uuid().parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getSale(client, id));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
