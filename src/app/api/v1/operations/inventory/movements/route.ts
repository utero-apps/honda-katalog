import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const positiveMovementTypes = ["opening", "receiving", "adjustment_in", "return_in"] as const;
const negativeMovementTypes = ["service_usage", "adjustment_out", "return_out"] as const;
const movementTypes = [...positiveMovementTypes, ...negativeMovementTypes, "opname"] as const;

export const movementInput = z.object({
  warehouseId: z.uuid(),
  productId: z.uuid(),
  movementType: z.enum(movementTypes),
  quantity: z.coerce.number().finite().refine((value) => value !== 0),
  unitCost: z.coerce.number().finite().min(0).default(0),
  referenceType: z.string().min(2).max(80),
  referenceId: z.uuid().nullable().optional(),
  idempotencyKey: z.string().min(8).max(200),
  reason: z.string().max(1000).optional(),
}).superRefine((value, context) => {
  if (positiveMovementTypes.some((type) => type === value.movementType) && value.quantity < 0) {
    context.addIssue({ code: "custom", path: ["quantity"], message: "Kuantitas harus positif untuk tipe pergerakan masuk" });
  }
  if (negativeMovementTypes.some((type) => type === value.movementType) && value.quantity > 0) {
    context.addIssue({ code: "custom", path: ["quantity"], message: "Kuantitas harus negatif untuk tipe pergerakan keluar" });
  }
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "inventory.adjust");
    const body = await parseBody(request, movementInput);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => (
      await client.query(
        `INSERT INTO app.stock_movements(
          warehouse_id, product_id, movement_type, quantity, unit_cost,
          reference_type, reference_id, idempotency_key, reason, actor_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, occurred_at AS "occurredAt"`,
        [
          body.warehouseId, body.productId, body.movementType, body.quantity, body.unitCost,
          body.referenceType, body.referenceId ?? null, body.idempotencyKey, body.reason ?? null, user.id,
        ],
      )
    ).rows[0]);
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
