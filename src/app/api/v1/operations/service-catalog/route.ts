import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { listPosServices } from "@/features/pos/service";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export const serviceCatalogInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,80}$/, "Kode hanya boleh berisi huruf kapital, angka, garis bawah, atau strip"),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2_000).nullable().optional(),
  fixedPrice: z.coerce.number().positive().max(999_999_999_999),
  sortOrder: z.coerce.number().int().min(0).max(999_999).default(0),
});

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      (client) => listPosServices(client),
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.write");
    const input = await parseBody(request, serviceCatalogInput);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const duplicate = await client.query(
          "SELECT 1 FROM app.pos_services WHERE code=$1",
          [input.code],
        );
        if (duplicate.rowCount)
          throw new ApiError(409, "SERVICE_CODE_EXISTS", "Kode jasa sudah digunakan");
        const created = (await client.query(
          `INSERT INTO app.pos_services(code,name,description,fixed_price,sort_order)
           VALUES($1,$2,$3,$4,$5)
           RETURNING id,code,name,description,fixed_price::text AS "fixedPrice",sort_order AS "sortOrder"`,
          [input.code, input.name, input.description || null, input.fixedPrice, input.sortOrder],
        )).rows[0];
        const result = { ...created, fixedPrice: Number(created.fixedPrice) };
        await recordAudit(client, {
          actorId: user.id,
          requestId,
          action: "service_catalog.create",
          entityType: "pos_service",
          entityId: created.id,
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
