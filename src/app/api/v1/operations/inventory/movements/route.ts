import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const positiveMovementTypes = ["opening", "receiving", "adjustment_in", "return_in"] as const;
const negativeMovementTypes = ["service_usage", "adjustment_out", "return_out"] as const;
const movementTypes = [...positiveMovementTypes, ...negativeMovementTypes, "opname"] as const;
const canViewCost = (role: string) => ["owner", "admin", "finance"].includes(role);

const movementQuery = z.object({
  warehouseId: z.uuid().optional(),
  productId: z.uuid().optional(),
  movementType: z.enum(movementTypes).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

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

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "inventory.read");
    const showCost = canViewCost(user.role);
    const searchParams = new URL(request.url).searchParams;
    const query = movementQuery.parse({
      warehouseId: searchParams.get("warehouseId") || undefined,
      productId: searchParams.get("productId") || undefined,
      movementType: searchParams.get("movementType") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      limit: searchParams.get("limit") || undefined,
    });
    if (query.from && query.to && query.to < query.from) {
      throw new ApiError(422, "INVALID_DATE_RANGE", "Tanggal akhir tidak boleh sebelum tanggal awal");
    }
    const exclusiveTo = query.to ? new Date(`${query.to}T00:00:00.000Z`) : null;
    exclusiveTo?.setUTCDate(exclusiveTo.getUTCDate() + 1);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => (await client.query(
        `SELECT m.id,m.movement_type AS "movementType",m.quantity::text,m.unit_cost::text AS "unitCost",
           ABS(m.quantity*m.unit_cost)::text AS value,m.reference_type AS "referenceType",
           m.reference_id AS "referenceId",m.reason,m.occurred_at AS "occurredAt",
           p.id AS "productId",p.part_code AS "partCode",p.name AS "productName",p.unit,
           w.id AS "warehouseId",w.code AS "warehouseCode",w.name AS "warehouseName",
           u.id AS "actorId",u.display_name AS "actorName"
         FROM app.stock_movements m
         JOIN app.products p ON p.id=m.product_id
         JOIN app.warehouses w ON w.id=m.warehouse_id
         LEFT JOIN app.users u ON u.id=m.actor_id
         WHERE ($1::uuid IS NULL OR m.warehouse_id=$1)
           AND ($2::uuid IS NULL OR m.product_id=$2)
           AND ($3::app.stock_movement_type IS NULL OR m.movement_type=$3)
           AND ($4::date IS NULL OR m.occurred_at >= $4::date)
           AND ($5::date IS NULL OR m.occurred_at < $5::date)
         ORDER BY m.occurred_at DESC,m.id DESC LIMIT $6`,
        [query.warehouseId ?? null, query.productId ?? null, query.movementType ?? null, query.from ?? null, exclusiveTo?.toISOString().slice(0, 10) ?? null, query.limit],
      )).rows.map((row) => ({
        ...row,
        quantity: Number(row.quantity),
        unitCost: showCost ? Number(row.unitCost) : null,
        value: showCost ? Number(row.value) : null,
      })),
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
