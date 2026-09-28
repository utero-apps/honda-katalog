import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { salesQuerySchema } from "@/features/pos/schemas";
import { listSales } from "@/features/pos/service";
import { handleCheckout } from "@/features/pos/http";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "pos.read");
    const input = salesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => listSales(client, input));
    return ok(data.items, { requestId, page: data.page, pageSize: data.pageSize, total: data.total });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) { return handleCheckout(request); }
