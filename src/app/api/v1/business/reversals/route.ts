import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.object({
  entityType: z.enum(["payment", "expense", "customer_invoice", "vendor_invoice"]),
  entityId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "finance.post");
    const body = await parseBody(request, input);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        let result;
        if (body.entityType === "payment") {
          result = await client.query<{ id: string; vendor_invoice_id: string | null; customer_invoice_id: string | null }>(
            "UPDATE app.payments SET reversed_at=now(),reversed_by=$1,reversal_reason=$2 WHERE id=$3 AND reversed_at IS NULL RETURNING id,vendor_invoice_id,customer_invoice_id",
            [user.id, body.reason, body.entityId],
          );
          const vendorInvoiceId = result.rows[0]?.vendor_invoice_id;
          if (vendorInvoiceId) {
            const invoice = (
              await client.query<{ total: string }>(
                "SELECT total::text FROM app.vendor_invoices WHERE id=$1 AND status<>'reversed' FOR UPDATE",
                [vendorInvoiceId],
              )
            ).rows[0];
            if (invoice) {
              const paid = Number(
                (
                  await client.query<{ paid: string }>(
                    "SELECT COALESCE(SUM(amount),0)::text AS paid FROM app.payments WHERE vendor_invoice_id=$1 AND reversed_at IS NULL",
                    [vendorInvoiceId],
                  )
                ).rows[0].paid,
              );
              const total = Number(invoice.total);
              const status = paid >= total ? "paid" : paid > 0 ? "partially_paid" : "posted";
              await client.query("UPDATE app.vendor_invoices SET status=$1 WHERE id=$2", [status, vendorInvoiceId]);
            }
          }
          const customerInvoiceId = result.rows[0]?.customer_invoice_id;
          if (customerInvoiceId) {
            const serviceOrder = (await client.query<{ id: string; status: string; handedOverAt: string | null }>(
              `SELECT s.id,s.status,s.handed_over_at AS "handedOverAt"
                 FROM app.service_orders s
                 JOIN app.customer_invoices i ON i.service_order_id=s.id
                WHERE i.id=$1 FOR UPDATE OF s`,
              [customerInvoiceId],
            )).rows[0];
            if (serviceOrder && (serviceOrder.handedOverAt || serviceOrder.status === "completed"))
              throw new ApiError(409, "HANDOVER_ALREADY_COMPLETED", "Pembayaran tidak dapat direversal setelah serah-terima");
            const invoice = (await client.query<{ status: string; total: string }>(
              "SELECT status,total::text FROM app.customer_invoices WHERE id=$1 FOR UPDATE",
              [customerInvoiceId],
            )).rows[0];
            if (!invoice || invoice.status === "reversed")
              throw new ApiError(409, "INVOICE_NOT_REVERSIBLE", "Invoice pelanggan tidak aktif");
            const paid = Number((await client.query<{ paid: string }>(
              "SELECT COALESCE(SUM(amount),0)::text AS paid FROM app.payments WHERE customer_invoice_id=$1 AND direction='incoming' AND reversed_at IS NULL",
              [customerInvoiceId],
            )).rows[0].paid);
            const status = Math.round(paid * 100) >= Math.round(Number(invoice.total) * 100)
              ? "paid" : paid > 0 ? "partially_paid" : "posted";
            await client.query("UPDATE app.customer_invoices SET status=$1::app.invoice_status WHERE id=$2", [status, customerInvoiceId]);
            const nextOrderStatus = status === "paid" ? "paid" : "invoiced";
            if (serviceOrder && serviceOrder.status !== nextOrderStatus) {
              await client.query("UPDATE app.service_orders SET status=$1::app.service_status,updated_by=$2,updated_at=now() WHERE id=$3", [nextOrderStatus, user.id, serviceOrder.id]);
              await client.query(
                "INSERT INTO app.service_order_status_history(service_order_id,from_status,to_status,reason,actor_id) VALUES($1,$2,$3,$4,$5)",
                [serviceOrder.id, serviceOrder.status, nextOrderStatus, "Pembayaran direversal", user.id],
              );
            }
          }
        } else if (body.entityType === "expense") {
          result = await client.query(
            "UPDATE app.expenses SET reversed_at=now(),reversed_by=$1,reversal_reason=$2 WHERE id=$3 AND reversed_at IS NULL RETURNING id",
            [user.id, body.reason, body.entityId],
          );
        } else if (body.entityType === "customer_invoice") {
          const linkedOrder = (await client.query<{ id: string }>(
            "SELECT id FROM app.service_orders WHERE id=(SELECT service_order_id FROM app.customer_invoices WHERE id=$1) FOR UPDATE",
            [body.entityId],
          )).rows[0];
          if (linkedOrder) throw new ApiError(409, "SERVICE_INVOICE_REVERSAL_UNSUPPORTED", "Invoice service order tidak dapat direversal tanpa alur penerbitan ulang");
          const invoice = (await client.query<{ id: string }>(
            "SELECT id FROM app.customer_invoices WHERE id=$1 AND status<>'reversed' FOR UPDATE",
            [body.entityId],
          )).rows[0];
          if (!invoice) throw new ApiError(409, "REVERSAL_NOT_ALLOWED", "Invoice tidak ditemukan atau sudah direversal");
          const activePayments = await client.query(
            "SELECT 1 FROM app.payments WHERE customer_invoice_id=$1 AND reversed_at IS NULL LIMIT 1",
            [body.entityId],
          );
          if (activePayments.rowCount)
            throw new ApiError(409, "INVOICE_HAS_PAYMENTS", "Reversal pembayaran aktif wajib dilakukan sebelum reversal invoice");
          result = await client.query("UPDATE app.customer_invoices SET status='reversed' WHERE id=$1 AND status<>'reversed' RETURNING id", [body.entityId]);
        } else {
          result = await client.query("UPDATE app.vendor_invoices SET status='reversed' WHERE id=$1 AND status<>'reversed' RETURNING id", [body.entityId]);
        }
        if (!result.rows[0]) throw new ApiError(409, "REVERSAL_NOT_ALLOWED", "Record tidak ditemukan atau sudah direversal");
        await recordAudit(client, {
          actorId: user.id,
          requestId,
          action: "finance.reverse",
          entityType: body.entityType,
          entityId: body.entityId,
          after: { reason: body.reason },
        });
        return { reversed: true, id: body.entityId };
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
