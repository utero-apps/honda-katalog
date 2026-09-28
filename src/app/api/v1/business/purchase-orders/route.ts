import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const statuses = [
  "draft",
  "submitted",
  "approved",
  "partially_received",
  "received",
  "closed",
  "rejected",
  "cancelled",
] as const;
const querySchema = z.object({
  query: z.string().trim().max(120).default(""),
  status: z.enum(statuses).optional(),
  vendorId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const input = z.object({
  orderNumber: z.string().min(3).max(80),
  vendorId: z.uuid(),
  expectedDate: z.string().date().optional(),
  notes: z.string().max(4000).optional(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "purchasing.read");
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
            `(po.order_number ILIKE $${values.length} OR v.name ILIKE $${values.length})`,
          );
        }
        if (query.status) {
          values.push(query.status);
          conditions.push(`po.status=$${values.length}::app.purchase_status`);
        }
        if (query.vendorId) {
          values.push(query.vendorId);
          conditions.push(`po.vendor_id=$${values.length}`);
        }
        values.push(query.limit);
        const where = conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";
        const rows = await client.query(
          `SELECT po.id,po.order_number AS "orderNumber",po.status,po.order_date AS "orderDate",po.expected_date AS "expectedDate",po.notes,po.created_at AS "createdAt",v.id AS "vendorId",v.name AS vendor,CASE WHEN v.is_active THEN 'active' ELSE 'inactive' END AS "vendorStatus",
        COALESCE(SUM(i.ordered_quantity*i.unit_price),0)::text total,COUNT(i.id)::int AS "itemCount",COALESCE(SUM(i.ordered_quantity),0)::text AS "orderedQuantity",COALESCE(SUM(i.received_quantity),0)::text AS "receivedQuantity",
        COUNT(i.id) FILTER (WHERE i.received_quantity>=i.ordered_quantity)::int AS "receivedItemCount",
        COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'productName',p.name,'orderedQuantity',i.ordered_quantity,'receivedQuantity',i.received_quantity,'unitPrice',i.unit_price) ORDER BY p.name) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
        FROM app.purchase_orders po JOIN app.vendors v ON v.id=po.vendor_id LEFT JOIN app.purchase_order_items i ON i.purchase_order_id=po.id LEFT JOIN app.products p ON p.id=i.product_id
        ${where} GROUP BY po.id,v.id,v.name ORDER BY po.created_at DESC LIMIT $${values.length}`,
          values,
        );
        return rows.rows.map((row) => ({
          ...row,
          total: Number(row.total),
          orderedQuantity: Number(row.orderedQuantity),
          receivedQuantity: Number(row.receivedQuantity),
          items: Array.isArray(row.items)
            ? row.items.map((item: Record<string, unknown>) => ({
                ...item,
                orderedQuantity: Number(item.orderedQuantity),
                receivedQuantity: Number(item.receivedQuantity),
                unitPrice: Number(item.unitPrice),
              }))
            : [],
          receiptProgressPercent: Number(row.orderedQuantity)
            ? Number(
                (
                  (Number(row.receivedQuantity) / Number(row.orderedQuantity)) *
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
      "purchasing.write",
    );
    const body = await parseBody(request, input);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const purchaseOrder = (
          await client.query(
            'INSERT INTO app.purchase_orders(order_number,vendor_id,expected_date,notes,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,order_number AS "orderNumber",status',
            [
              body.orderNumber,
              body.vendorId,
              body.expectedDate || null,
              body.notes || null,
              user.id,
            ],
          )
        ).rows[0];
        const items = [];
        for (const item of body.items)
          items.push(
            (
              await client.query(
                'INSERT INTO app.purchase_order_items(purchase_order_id,product_id,ordered_quantity,unit_price) VALUES($1,$2,$3,$4) RETURNING id,product_id AS "productId",ordered_quantity::text AS quantity',
                [
                  purchaseOrder.id,
                  item.productId,
                  item.quantity,
                  item.unitPrice,
                ],
              )
            ).rows[0],
          );
        return {
          ...purchaseOrder,
          items: items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
          })),
        };
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
