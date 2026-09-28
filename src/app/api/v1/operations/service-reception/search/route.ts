import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { searchSchema } from "@/features/service-reception/schemas";
import { searchReceptionCustomers } from "@/features/service-reception/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const input = searchSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => searchReceptionCustomers(client, input.query, input.limit));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
