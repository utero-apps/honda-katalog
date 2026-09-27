import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { productUpdateSchema } from "@/features/catalog/schemas";
import { getProduct, updateProduct } from "@/features/catalog/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";
import { recordAudit } from "@/server/audit";

const idSchema = z.uuid();

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.read");
    const id = idSchema.parse((await context.params).id);
    const product = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getProduct(client, id));
    return ok(product, { requestId });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.write");
    const id = idSchema.parse((await context.params).id);
    const input = await parseBody(request, productUpdateSchema);
    const product = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const before = await getProduct(client, id);
      const updated = await updateProduct(client, user.id, id, input);
      await recordAudit(client, { actorId: user.id, requestId, action: "product.update", entityType: "product", entityId: id, before, after: updated });
      return updated;
    });
    return ok(product, { requestId });
  } catch (error) {
    return fail(error);
  }
}
