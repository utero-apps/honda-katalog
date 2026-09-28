import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { posProductsQuerySchema } from "@/features/pos/schemas";
import { listPosProducts } from "@/features/pos/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const input = posProductsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => listPosProducts(client, input));
    return ok(data.items, { requestId, page: data.page, pageSize: data.pageSize, total: data.total, warehouseId: data.warehouseId });
  } catch (error) { return fail(error); }
}
