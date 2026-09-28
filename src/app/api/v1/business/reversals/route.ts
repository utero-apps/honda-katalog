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
          result = await client.query<{ id: string; vendor_invoice_id: string | null }>(
            "UPDATE app.payments SET reversed_at=now(),reversed_by=$1,reversal_reason=$2 WHERE id=$3 AND reversed_at IS NULL RETURNING id,vendor_invoice_id",
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
        } else if (body.entityType === "expense") {
          result = await client.query(
            "UPDATE app.expenses SET reversed_at=now(),reversed_by=$1,reversal_reason=$2 WHERE id=$3 AND reversed_at IS NULL RETURNING id",
            [user.id, body.reason, body.entityId],
          );
        } else if (body.entityType === "customer_invoice") {
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
