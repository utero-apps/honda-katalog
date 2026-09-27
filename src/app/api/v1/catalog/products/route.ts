import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { catalogQuerySchema, productInputSchema } from "@/features/catalog/schemas";
import { createProduct, listProducts } from "@/features/catalog/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";
import { recordAudit } from "@/server/audit";

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.read");
    const query = catalogQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => listProducts(client, query));
    return ok(data.items, { page: data.page, pageSize: data.pageSize, total: data.total, requestId });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.write");
    const input = await parseBody(request, productInputSchema);
    const product = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const created = await createProduct(client, user.id, input);
      await recordAudit(client, { actorId: user.id, requestId, action: "product.create", entityType: "product", entityId: created.id, after: created });
      return created;
    });
    return ok(product, { requestId });
  } catch (error) {
    return fail(error);
  }
}
