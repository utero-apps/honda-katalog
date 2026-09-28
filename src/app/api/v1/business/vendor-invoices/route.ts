import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export const vendorInvoiceInput = z
  .object({
    invoiceNumber: z.string().trim().min(2).max(100),
    vendorId: z.uuid(),
    purchaseOrderId: z.uuid().nullable().optional(),
    total: z.coerce.number().finite().positive().multipleOf(0.01).max(9999999999999.99),
    issuedAt: z.string().date(),
    dueAt: z.string().date().optional(),
  })
  .refine((value) => !value.dueAt || value.dueAt >= value.issuedAt, {
    message: "Tanggal jatuh tempo tidak boleh sebelum tanggal invoice",
    path: ["dueAt"],
  });

type VendorInvoiceInput = z.infer<typeof vendorInvoiceInput>;
type ExistingVendorInvoice = {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  purchaseOrderId: string | null;
  status: string;
  total: string;
  issuedAt: string;
  dueAt: string | null;
};
type InvoiceablePurchaseOrder = {
  id: string;
  vendorId: string;
  status: string;
};

function toCents(value: number) {
  return Math.round(value * 100);
}

export function assertExistingInvoiceMatches(existing: ExistingVendorInvoice, input: VendorInvoiceInput) {
  const matches =
    existing.invoiceNumber.toLocaleLowerCase("en-US") === input.invoiceNumber.toLocaleLowerCase("en-US") &&
    existing.vendorId === input.vendorId &&
    existing.purchaseOrderId === (input.purchaseOrderId ?? null) &&
    toCents(Number(existing.total)) === toCents(input.total) &&
    existing.issuedAt === input.issuedAt &&
    existing.dueAt === (input.dueAt ?? null);
  if (!matches)
    throw new ApiError(409, "DUPLICATE_VENDOR_INVOICE", "Nomor invoice sudah digunakan vendor ini dengan data berbeda");
  if (existing.status === "reversed")
    throw new ApiError(409, "VENDOR_INVOICE_REVERSED", "Invoice vendor sudah direversal dan tidak dapat dipakai ulang");
}

export function assertPurchaseOrderInvoiceable(purchaseOrder: InvoiceablePurchaseOrder | undefined, vendorId: string) {
  if (!purchaseOrder) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order tidak ditemukan");
  if (purchaseOrder.vendorId !== vendorId)
    throw new ApiError(422, "PURCHASE_ORDER_VENDOR_MISMATCH", "Vendor invoice tidak sama dengan vendor purchase order");
  if (!["partially_received", "received"].includes(purchaseOrder.status))
    throw new ApiError(409, "PURCHASE_ORDER_NOT_INVOICEABLE", "Purchase order harus sudah diterima sebagian atau seluruhnya");
}

export function assertInvoiceWithinRemaining(invoiceTotal: number, purchaseOrderTotal: number, invoicedTotal: number) {
  const remainingCents = Math.max(toCents(purchaseOrderTotal) - toCents(invoicedTotal), 0);
  if (remainingCents === 0)
    throw new ApiError(409, "PURCHASE_ORDER_FULLY_INVOICED", "Purchase order sudah ditagihkan seluruhnya");
  if (toCents(invoiceTotal) > remainingCents)
    throw new ApiError(422, "PURCHASE_ORDER_INVOICE_TOTAL_EXCEEDED", "Total invoice melebihi sisa nilai purchase order");
  return remainingCents / 100;
}

function publicInvoice(invoice: ExistingVendorInvoice) {
  return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status };
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "finance.read");
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const result = await client.query<{ total: string; paid: string; outstanding: string; [key: string]: unknown }>(
          `SELECT i.id,i.invoice_number AS "invoiceNumber",i.vendor_id AS "vendorId",v.name AS vendor,
                  i.purchase_order_id AS "purchaseOrderId",po.order_number AS "purchaseOrderNumber",i.status,
                  i.total::text AS total,COALESCE(payments.paid,0)::text AS paid,
                  GREATEST(i.total-COALESCE(payments.paid,0),0)::text AS outstanding,
                  i.issued_at AS "issuedAt",i.due_at AS "dueAt",
                  greatest(current_date-coalesce(i.due_at,current_date),0) AS "overdueDays"
             FROM app.vendor_invoices i
             JOIN app.vendors v ON v.id=i.vendor_id
        LEFT JOIN app.purchase_orders po ON po.id=i.purchase_order_id
        LEFT JOIN (
                  SELECT vendor_invoice_id,SUM(amount) AS paid
                    FROM app.payments
                   WHERE direction='outgoing' AND reversed_at IS NULL
                GROUP BY vendor_invoice_id
                  ) payments ON payments.vendor_invoice_id=i.id
         ORDER BY i.due_at NULLS LAST,i.created_at DESC
            LIMIT 200`,
        );
        return result.rows.map(({ total, paid, outstanding, ...invoice }) => ({
          ...invoice,
          total: Number(total),
          paid: Number(paid),
          outstanding: Number(outstanding),
        }));
      },
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
    const user = await requirePermission(request, requestId, "finance.post");
    const body = await parseBody(request, vendorInvoiceInput);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const normalizedInvoiceNumber = body.invoiceNumber.toLocaleLowerCase("en-US");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `vendor-invoice:${body.vendorId}:${normalizedInvoiceNumber}`,
        ]);
        const existing = (
          await client.query<ExistingVendorInvoice>(
            `SELECT id,invoice_number AS "invoiceNumber",vendor_id AS "vendorId",
                    purchase_order_id AS "purchaseOrderId",status,total::text,
                    issued_at::text AS "issuedAt",due_at::text AS "dueAt"
               FROM app.vendor_invoices
              WHERE vendor_id=$1 AND lower(invoice_number)=lower($2)
              LIMIT 1 FOR UPDATE`,
            [body.vendorId, body.invoiceNumber],
          )
        ).rows[0];
        if (existing) {
          assertExistingInvoiceMatches(existing, body);
          return publicInvoice(existing);
        }

        let remainingInvoiceable: number | null = null;
        if (body.purchaseOrderId) {
          const purchaseOrder = (
            await client.query<InvoiceablePurchaseOrder>(
              `SELECT po.id,po.vendor_id AS "vendorId",po.status
                 FROM app.purchase_orders po
                WHERE po.id=$1
                FOR UPDATE OF po`,
              [body.purchaseOrderId],
            )
          ).rows[0];
          assertPurchaseOrderInvoiceable(purchaseOrder, body.vendorId);
          const totals = (
            await client.query<{ purchaseOrderTotal: string; invoicedTotal: string }>(
              `SELECT COALESCE((SELECT SUM(item.quantity*item.unit_cost)
                                  FROM app.goods_receipt_items item
                                  JOIN app.goods_receipts receipt ON receipt.id=item.goods_receipt_id
                                 WHERE receipt.purchase_order_id=$1),0)::text AS "purchaseOrderTotal",
                      COALESCE((SELECT SUM(invoice.total)
                                  FROM app.vendor_invoices invoice
                                 WHERE invoice.purchase_order_id=$1
                                   AND invoice.status<>'reversed'),0)::text AS "invoicedTotal"`,
              [body.purchaseOrderId],
            )
          ).rows[0];
          remainingInvoiceable = assertInvoiceWithinRemaining(
            body.total,
            Number(totals.purchaseOrderTotal),
            Number(totals.invoicedTotal),
          );
        }

        const inserted = (
          await client.query<ExistingVendorInvoice>(
            `INSERT INTO app.vendor_invoices(invoice_number,vendor_id,purchase_order_id,status,total,issued_at,due_at,created_by)
             VALUES($1,$2,$3,'posted',$4,$5,$6,$7)
             ON CONFLICT(vendor_id,invoice_number) DO NOTHING
             RETURNING id,invoice_number AS "invoiceNumber",vendor_id AS "vendorId",
                       purchase_order_id AS "purchaseOrderId",status,total::text,
                       issued_at::text AS "issuedAt",due_at::text AS "dueAt"`,
            [body.invoiceNumber, body.vendorId, body.purchaseOrderId ?? null, body.total, body.issuedAt, body.dueAt ?? null, user.id],
          )
        ).rows[0];
        if (!inserted) {
          const duplicate = (
            await client.query<ExistingVendorInvoice>(
              `SELECT id,invoice_number AS "invoiceNumber",vendor_id AS "vendorId",
                      purchase_order_id AS "purchaseOrderId",status,total::text,
                      issued_at::text AS "issuedAt",due_at::text AS "dueAt"
                 FROM app.vendor_invoices
                WHERE vendor_id=$1 AND invoice_number=$2 FOR UPDATE`,
              [body.vendorId, body.invoiceNumber],
            )
          ).rows[0];
          assertExistingInvoiceMatches(duplicate, body);
          return publicInvoice(duplicate);
        }
        await recordAudit(client, {
          actorId: user.id,
          requestId,
          action: "finance.vendor_invoice.create",
          entityType: "vendor_invoice",
          entityId: inserted.id,
          after: {
            invoiceNumber: inserted.invoiceNumber,
            vendorId: body.vendorId,
            purchaseOrderId: body.purchaseOrderId ?? null,
            total: body.total,
            remainingInvoiceableBefore: remainingInvoiceable,
          },
        });
        return publicInvoice(inserted);
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
