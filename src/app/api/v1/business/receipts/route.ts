import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export const receiptInput = z.object({
  receiptNumber: z.string().min(3).max(80),
  purchaseOrderId: z.uuid(),
  warehouseId: z.uuid(),
  idempotencyKey: z.string().min(8).max(200),
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.uuid(),
    quantity: z.coerce.number().finite().positive(),
    unitCost: z.coerce.number().finite().min(0),
  })).min(1).refine((items) => new Set(items.map((item) => item.purchaseOrderItemId)).size === items.length, {
    message: "Item PO tidak boleh duplikat dalam satu penerimaan",
  }),
});

export function assertReceivablePurchaseOrder(purchaseOrder: { status: string } | undefined) {
  if (!purchaseOrder) throw new ApiError(404, "PO_NOT_FOUND", "Purchase order tidak ditemukan");
  if (purchaseOrder.status !== "approved" && purchaseOrder.status !== "partially_received") {
    throw new ApiError(409, "PO_NOT_RECEIVABLE", "Penerimaan hanya dapat dilakukan untuk PO yang disetujui");
  }
}

export function assertReceiptItemBelongsToPurchaseOrder<T>(purchaseOrderItem: T | undefined): asserts purchaseOrderItem is T {
  if (!purchaseOrderItem) throw new ApiError(422, "RECEIPT_ITEM_NOT_IN_PO", "Item penerimaan tidak termasuk dalam purchase order");
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "inventory.receive");
    const body = await parseBody(request, receiptInput);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const existing = (await client.query(
        "SELECT id, receipt_number AS \"receiptNumber\" FROM app.goods_receipts WHERE idempotency_key=$1",
        [body.idempotencyKey],
      )).rows[0];
      if (existing) return existing;

      const purchaseOrder = (await client.query<{ status: string }>(
        "SELECT status FROM app.purchase_orders WHERE id=$1 FOR UPDATE",
        [body.purchaseOrderId],
      )).rows[0];
      assertReceivablePurchaseOrder(purchaseOrder);

      const receipt = (await client.query(
        `INSERT INTO app.goods_receipts(receipt_number,purchase_order_id,warehouse_id,received_by,notes,idempotency_key)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id, receipt_number AS "receiptNumber"`,
        [body.receiptNumber, body.purchaseOrderId, body.warehouseId, user.id, body.notes ?? null, body.idempotencyKey],
      )).rows[0];

      for (const item of body.items) {
        const purchaseOrderItem = (await client.query<{ product_id: string; ordered_quantity: string; received_quantity: string }>(
          `SELECT product_id, ordered_quantity::text, received_quantity::text
           FROM app.purchase_order_items
           WHERE id=$1 AND purchase_order_id=$2 FOR UPDATE`,
          [item.purchaseOrderItemId, body.purchaseOrderId],
        )).rows[0];
        assertReceiptItemBelongsToPurchaseOrder(purchaseOrderItem);
        if (Number(purchaseOrderItem.received_quantity) + item.quantity > Number(purchaseOrderItem.ordered_quantity)) {
          throw new ApiError(409, "RECEIPT_QUANTITY_INVALID", "Jumlah penerimaan melebihi PO");
        }

        await client.query(
          "INSERT INTO app.goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost) VALUES($1,$2,$3,$4,$5)",
          [receipt.id, item.purchaseOrderItemId, purchaseOrderItem.product_id, item.quantity, item.unitCost],
        );
        await client.query(
          "UPDATE app.purchase_order_items SET received_quantity=received_quantity+$1 WHERE id=$2",
          [item.quantity, item.purchaseOrderItemId],
        );
        await client.query(
          `INSERT INTO app.stock_movements(
            warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,actor_id
          ) VALUES($1,$2,'receiving',$3,$4,'goods_receipt',$5,$6,$7)`,
          [body.warehouseId, purchaseOrderItem.product_id, item.quantity, item.unitCost, receipt.id, `${body.idempotencyKey}:${item.purchaseOrderItemId}`, user.id],
        );
      }

      await client.query(
        `UPDATE app.purchase_orders
         SET status=CASE WHEN NOT EXISTS(
           SELECT 1 FROM app.purchase_order_items WHERE purchase_order_id=$1 AND received_quantity<ordered_quantity
         ) THEN 'received'::app.purchase_status ELSE 'partially_received'::app.purchase_status END,
         updated_at=now() WHERE id=$1`,
        [body.purchaseOrderId],
      );
      return receipt;
    });
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
