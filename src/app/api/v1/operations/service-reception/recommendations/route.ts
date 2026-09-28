import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { recommendationSchema } from "@/features/service-reception/schemas";
import { getRecommendations } from "@/features/service-reception/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const input = recommendationSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getRecommendations(client, input));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
