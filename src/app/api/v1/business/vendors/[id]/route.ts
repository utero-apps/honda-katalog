import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

const vendorIdSchema = z.uuid();

function number(value: unknown) {
  return Number(value ?? 0);
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "purchasing.read");
    const vendorId = vendorIdSchema.parse((await context.params).id);
    const canViewFinance = ["owner", "admin", "finance"].includes(user.role);

    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const profileResult = await client.query(
          `SELECT id,code,name,phone,email,address,payment_terms_days AS "paymentTermsDays",
                  is_active AS "isActive",created_at AS "createdAt"
           FROM app.vendors WHERE id=$1`,
          [vendorId],
        );
        const profile = profileResult.rows[0];
        if (!profile) throw new ApiError(404, "VENDOR_NOT_FOUND", "Vendor tidak ditemukan");

        const productsResult = await client.query(
          `SELECT vp.product_id AS "productId",p.part_code AS "partCode",p.name,p.unit,
                  p.status,vp.vendor_part_code AS "vendorPartCode",vp.last_price::text AS "lastPrice",
                  vp.lead_time_days AS "leadTimeDays"
           FROM app.vendor_products vp JOIN app.products p ON p.id=vp.product_id
           WHERE vp.vendor_id=$1 ORDER BY p.name,p.part_code LIMIT 100`,
          [vendorId],
        );
        const ordersResult = await client.query(
          `SELECT po.id,po.order_number AS "orderNumber",po.status,po.order_date AS "orderDate",
                  po.expected_date AS "expectedDate",po.notes,
                  COUNT(poi.id)::int AS "itemCount",
                  COALESCE(SUM(poi.ordered_quantity*poi.unit_price),0)::text AS total,
                  COALESCE(SUM(poi.ordered_quantity),0)::text AS "orderedQuantity",
                  COALESCE(SUM(poi.received_quantity),0)::text AS "receivedQuantity"
           FROM app.purchase_orders po LEFT JOIN app.purchase_order_items poi ON poi.purchase_order_id=po.id
           WHERE po.vendor_id=$1 GROUP BY po.id
           ORDER BY po.order_date DESC,po.created_at DESC LIMIT 100`,
          [vendorId],
        );
        const receiptsResult = await client.query(
          `SELECT gr.id,gr.receipt_number AS "receiptNumber",po.id AS "purchaseOrderId",
                  po.order_number AS "orderNumber",gr.received_at AS "receivedAt",w.name AS warehouse,
                  COUNT(gri.id)::int AS "itemCount",COALESCE(SUM(gri.quantity),0)::text AS quantity,
                  COALESCE(SUM(gri.quantity*gri.unit_cost),0)::text AS value
           FROM app.goods_receipts gr
           JOIN app.purchase_orders po ON po.id=gr.purchase_order_id
           JOIN app.warehouses w ON w.id=gr.warehouse_id
           LEFT JOIN app.goods_receipt_items gri ON gri.goods_receipt_id=gr.id
           WHERE po.vendor_id=$1 GROUP BY gr.id,po.id,w.id
           ORDER BY gr.received_at DESC,gr.id DESC LIMIT 100`,
          [vendorId],
        );

        let invoices: Record<string, unknown>[] | null = null;
        let payments: Record<string, unknown>[] | null = null;
        let outstanding: number | null = null;
        if (canViewFinance) {
          const invoiceResult = await client.query(
            `SELECT i.id,i.invoice_number AS "invoiceNumber",i.purchase_order_id AS "purchaseOrderId",
                    po.order_number AS "orderNumber",i.status,i.issued_at AS "issuedAt",i.due_at AS "dueAt",
                    i.total::text AS total,COALESCE(SUM(p.amount) FILTER
                    (WHERE p.direction='outgoing' AND p.reversed_at IS NULL),0)::text AS paid
             FROM app.vendor_invoices i
             LEFT JOIN app.purchase_orders po ON po.id=i.purchase_order_id
             LEFT JOIN app.payments p ON p.vendor_invoice_id=i.id
             WHERE i.vendor_id=$1 GROUP BY i.id,po.id
             ORDER BY i.issued_at DESC,i.created_at DESC LIMIT 100`,
            [vendorId],
          );
          invoices = invoiceResult.rows.map((row) => ({
            ...row,
            total: number(row.total),
            paid: number(row.paid),
            outstanding: row.status === "reversed" ? 0 : Math.max(0, number(row.total) - number(row.paid)),
          }));
          const debtResult = await client.query(
            `SELECT COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)),0)::text AS outstanding
             FROM app.vendor_invoices i
             LEFT JOIN (SELECT vendor_invoice_id,SUM(amount) AS paid FROM app.payments
                        WHERE direction='outgoing' AND reversed_at IS NULL GROUP BY vendor_invoice_id) p
               ON p.vendor_invoice_id=i.id
             WHERE i.vendor_id=$1 AND i.status NOT IN ('draft','reversed')`,
            [vendorId],
          );
          outstanding = number(debtResult.rows[0]?.outstanding);
          const paymentResult = await client.query(
            `SELECT p.id,p.payment_number AS "paymentNumber",p.vendor_invoice_id AS "invoiceId",
                    i.invoice_number AS "invoiceNumber",p.amount::text AS amount,p.method,p.reference,
                    p.paid_at AS "paidAt",p.reversed_at AS "reversedAt"
             FROM app.payments p JOIN app.vendor_invoices i ON i.id=p.vendor_invoice_id
             WHERE i.vendor_id=$1 AND p.direction='outgoing'
             ORDER BY p.paid_at DESC,p.id DESC LIMIT 100`,
            [vendorId],
          );
          payments = paymentResult.rows.map((row) => ({ ...row, amount: number(row.amount) }));
        }

        return {
          profile,
          products: productsResult.rows.map((row) => ({ ...row, lastPrice: number(row.lastPrice) })),
          purchaseOrders: ordersResult.rows.map((row) => ({
            ...row,
            total: number(row.total),
            orderedQuantity: number(row.orderedQuantity),
            receivedQuantity: number(row.receivedQuantity),
          })),
          receipts: receiptsResult.rows.map((row) => ({
            ...row,
            quantity: number(row.quantity),
            value: number(row.value),
          })),
          outstanding,
          invoices,
          payments,
        };
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
