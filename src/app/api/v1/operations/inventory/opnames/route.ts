import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const statuses = ["draft", "counting", "posted", "cancelled"] as const;
const querySchema = z.object({
  query: z.string().trim().max(120).default(""),
  status: z.enum(statuses).optional(),
  warehouseId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const input = z.object({
  opnameNumber: z.string().min(3).max(80),
  warehouseId: z.uuid(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "inventory.read");
    const query = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const values: unknown[] = [];
        const conditions: string[] = [];
        if (query.query) {
          values.push(`%${query.query}%`);
          conditions.push(
            `(o.opname_number ILIKE $${values.length} OR w.name ILIKE $${values.length})`,
          );
        }
        if (query.status) {
          values.push(query.status);
          conditions.push(`o.status=$${values.length}::app.opname_status`);
        }
        if (query.warehouseId) {
          values.push(query.warehouseId);
          conditions.push(`o.warehouse_id=$${values.length}`);
        }
        values.push(query.limit);
        const where = conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";
        const rows = await client.query(
          `SELECT o.id,o.opname_number AS "opnameNumber",o.status,o.notes,o.started_at AS "startedAt",o.posted_at AS "postedAt",w.id AS "warehouseId",w.name AS warehouse,COUNT(i.id)::int AS "itemCount",COUNT(i.id) FILTER (WHERE i.counted_quantity IS NOT NULL)::int AS "countedItemCount",COALESCE(SUM(i.system_quantity),0)::text AS "systemQuantity",COALESCE(SUM(i.counted_quantity) FILTER (WHERE i.counted_quantity IS NOT NULL),0)::text AS "countedQuantity",COALESCE(SUM(i.counted_quantity-i.system_quantity) FILTER (WHERE i.counted_quantity IS NOT NULL),0)::text AS difference
        FROM app.stock_opnames o JOIN app.warehouses w ON w.id=o.warehouse_id LEFT JOIN app.stock_opname_items i ON i.stock_opname_id=o.id ${where} GROUP BY o.id,w.id,w.name ORDER BY o.started_at DESC LIMIT $${values.length}`,
          values,
        );
        return rows.rows.map((row) => ({
          ...row,
          systemQuantity: Number(row.systemQuantity),
          countedQuantity: Number(row.countedQuantity),
          difference: Number(row.difference),
          progressPercent: Number(row.itemCount)
            ? Number(
                (
                  (Number(row.countedItemCount) / Number(row.itemCount)) *
                  100
                ).toFixed(1),
              )
            : 0,
        }));
      },
    );
    return ok(data, { requestId, total: data.length });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(
      request,
      requestId,
      "inventory.adjust",
    );
    const body = await parseBody(request, input);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const opname = (
          await client.query(
            "INSERT INTO app.stock_opnames(opname_number,warehouse_id,status,notes,started_by) VALUES($1,$2,'counting',$3,$4) RETURNING id,opname_number AS \"opnameNumber\",status",
            [body.opnameNumber, body.warehouseId, body.notes || null, user.id],
          )
        ).rows[0];
        await client.query(
          "INSERT INTO app.stock_opname_items(stock_opname_id,product_id,system_quantity) SELECT $1,product_id,quantity FROM app.inventory_balances WHERE warehouse_id=$2",
          [opname.id, body.warehouseId],
        );
        return opname;
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
