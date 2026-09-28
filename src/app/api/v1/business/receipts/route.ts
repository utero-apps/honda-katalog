import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const querySchema = z.object({
  query: z.string().trim().max(120).default(""),
  purchaseOrderId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const receiptInput = z.object({
  receiptNumber: z.string().min(3).max(80),
  purchaseOrderId: z.uuid(),
  warehouseId: z.uuid(),
  idempotencyKey: z.string().min(8).max(200),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.uuid(),
        quantity: z.coerce.number().finite().positive(),
        unitCost: z.coerce.number().finite().min(0),
      }),
    )
    .min(1)
    .refine(
      (items) =>
        new Set(items.map((item) => item.purchaseOrderItemId)).size ===
        items.length,
      { message: "Item PO tidak boleh duplikat dalam satu penerimaan" },
    ),
});

export function assertReceivablePurchaseOrder(
  purchaseOrder: { status: string } | undefined,
) {
  if (!purchaseOrder)
    throw new ApiError(404, "PO_NOT_FOUND", "Purchase order tidak ditemukan");
  if (
    purchaseOrder.status !== "approved" &&
    purchaseOrder.status !== "partially_received"
  )
    throw new ApiError(
      409,
      "PO_NOT_RECEIVABLE",
      "Penerimaan hanya dapat dilakukan untuk PO yang disetujui",
    );
}
export function assertReceiptItemBelongsToPurchaseOrder<T>(
  purchaseOrderItem: T | undefined,
): asserts purchaseOrderItem is T {
  if (!purchaseOrderItem)
    throw new ApiError(
      422,
      "RECEIPT_ITEM_NOT_IN_PO",
      "Item penerimaan tidak termasuk dalam purchase order",
    );
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "purchasing.read");
    const query = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (query.from && query.to && query.to < query.from)
      throw new ApiError(
        422,
        "INVALID_DATE_RANGE",
        "Tanggal akhir tidak boleh sebelum tanggal awal",
      );
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const values: unknown[] = [];
        const conditions: string[] = [];
        if (query.query) {
          values.push(`%${query.query}%`);
          conditions.push(
            `(gr.receipt_number ILIKE $${values.length} OR po.order_number ILIKE $${values.length} OR v.name ILIKE $${values.length})`,
          );
        }
        if (query.purchaseOrderId) {
          values.push(query.purchaseOrderId);
          conditions.push(`gr.purchase_order_id=$${values.length}`);
        }
        if (query.warehouseId) {
          values.push(query.warehouseId);
          conditions.push(`gr.warehouse_id=$${values.length}`);
        }
        if (query.from) {
          values.push(query.from);
          conditions.push(`gr.received_at >= $${values.length}::date`);
        }
        if (query.to) {
          values.push(query.to);
          conditions.push(
            `gr.received_at < ($${values.length}::date + interval '1 day')`,
          );
        }
        values.push(query.limit);
        const where = conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";
        const rows = await client.query(
          `SELECT gr.id,gr.receipt_number AS "receiptNumber",gr.received_at AS "receivedAt",gr.notes,po.id AS "purchaseOrderId",po.order_number AS "purchaseOrderNumber",po.status AS "purchaseOrderStatus",v.id AS "vendorId",v.name AS vendor,w.id AS "warehouseId",w.name AS warehouse,COUNT(gri.id)::int AS "itemCount",COALESCE(SUM(gri.quantity),0)::text AS "totalQuantity",COALESCE(SUM(gri.quantity*gri.unit_cost),0)::text AS total
        FROM app.goods_receipts gr JOIN app.purchase_orders po ON po.id=gr.purchase_order_id JOIN app.vendors v ON v.id=po.vendor_id JOIN app.warehouses w ON w.id=gr.warehouse_id LEFT JOIN app.goods_receipt_items gri ON gri.goods_receipt_id=gr.id
        ${where} GROUP BY gr.id,po.id,po.order_number,po.status,v.id,v.name,w.id,w.name ORDER BY gr.received_at DESC LIMIT $${values.length}`,
          values,
        );
        return rows.rows.map((row) => ({
          ...row,
          totalQuantity: Number(row.totalQuantity),
          total: Number(row.total),
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
      "inventory.receive",
    );
    const body = await parseBody(request, receiptInput);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const existing = (
          await client.query(
            'SELECT id, receipt_number AS "receiptNumber" FROM app.goods_receipts WHERE idempotency_key=$1',
            [body.idempotencyKey],
          )
        ).rows[0];
        if (existing) return existing;
        const purchaseOrder = (
          await client.query<{ status: string }>(
            "SELECT status FROM app.purchase_orders WHERE id=$1 FOR UPDATE",
            [body.purchaseOrderId],
          )
        ).rows[0];
        assertReceivablePurchaseOrder(purchaseOrder);
        const receipt = (
          await client.query(
            'INSERT INTO app.goods_receipts(receipt_number,purchase_order_id,warehouse_id,received_by,notes,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, receipt_number AS "receiptNumber"',
            [
              body.receiptNumber,
              body.purchaseOrderId,
              body.warehouseId,
              user.id,
              body.notes ?? null,
              body.idempotencyKey,
            ],
          )
        ).rows[0];
        for (const item of body.items) {
          const purchaseOrderItem = (
            await client.query<{
              product_id: string;
              ordered_quantity: string;
              received_quantity: string;
            }>(
              "SELECT product_id, ordered_quantity::text, received_quantity::text FROM app.purchase_order_items WHERE id=$1 AND purchase_order_id=$2 FOR UPDATE",
              [item.purchaseOrderItemId, body.purchaseOrderId],
            )
          ).rows[0];
          assertReceiptItemBelongsToPurchaseOrder(purchaseOrderItem);
          if (
            Number(purchaseOrderItem.received_quantity) + item.quantity >
            Number(purchaseOrderItem.ordered_quantity)
          )
            throw new ApiError(
              409,
              "RECEIPT_QUANTITY_INVALID",
              "Jumlah penerimaan melebihi PO",
            );
          await client.query(
            "INSERT INTO app.goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost) VALUES($1,$2,$3,$4,$5)",
            [
              receipt.id,
              item.purchaseOrderItemId,
              purchaseOrderItem.product_id,
              item.quantity,
              item.unitCost,
            ],
          );
          await client.query(
            "UPDATE app.purchase_order_items SET received_quantity=received_quantity+$1 WHERE id=$2",
            [item.quantity, item.purchaseOrderItemId],
          );
          await client.query(
            "INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,actor_id) VALUES($1,$2,'receiving',$3,$4,'goods_receipt',$5,$6,$7)",
            [
              body.warehouseId,
              purchaseOrderItem.product_id,
              item.quantity,
              item.unitCost,
              receipt.id,
              `${body.idempotencyKey}:${item.purchaseOrderItemId}`,
              user.id,
            ],
          );
        }
        await client.query(
          "UPDATE app.purchase_orders SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM app.purchase_order_items WHERE purchase_order_id=$1 AND received_quantity<ordered_quantity) THEN 'received'::app.purchase_status ELSE 'partially_received'::app.purchase_status END,updated_at=now() WHERE id=$1",
          [body.purchaseOrderId],
        );
        return receipt;
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
