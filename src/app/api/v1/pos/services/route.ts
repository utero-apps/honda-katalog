import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { listPosServices } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => listPosServices(client));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
