import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { serviceCatalogInput } from "@/app/api/v1/operations/service-catalog/route";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const idSchema = z.uuid();

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.write");
    const id = idSchema.parse((await context.params).id);
    const input = await parseBody(request, serviceCatalogInput);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const before = (await client.query(
          `SELECT id,code,name,description,fixed_price::text AS "fixedPrice",sort_order AS "sortOrder"
           FROM app.pos_services WHERE id=$1 FOR UPDATE`,
          [id],
        )).rows[0];
        if (!before)
          throw new ApiError(404, "SERVICE_NOT_FOUND", "Jasa tidak ditemukan");
        const duplicate = await client.query(
          "SELECT 1 FROM app.pos_services WHERE code=$1 AND id<>$2",
          [input.code, id],
        );
        if (duplicate.rowCount)
          throw new ApiError(409, "SERVICE_CODE_EXISTS", "Kode jasa sudah digunakan");
        const updated = (await client.query(
          `UPDATE app.pos_services
           SET code=$1,name=$2,description=$3,fixed_price=$4,sort_order=$5,updated_at=now()
           WHERE id=$6
           RETURNING id,code,name,description,fixed_price::text AS "fixedPrice",sort_order AS "sortOrder"`,
          [input.code, input.name, input.description || null, input.fixedPrice, input.sortOrder, id],
        )).rows[0];
        const result = { ...updated, fixedPrice: Number(updated.fixedPrice) };
        await recordAudit(client, {
          actorId: user.id,
          requestId,
          action: "service_catalog.update",
          entityType: "pos_service",
          entityId: id,
          before: { ...before, fixedPrice: Number(before.fixedPrice) },
          after: result,
        });
        return result;
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
