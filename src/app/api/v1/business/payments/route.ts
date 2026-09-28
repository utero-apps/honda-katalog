import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export const paymentInput = z
  .object({
    paymentNumber: z.string().min(3).max(80),
    direction: z.enum(["incoming", "outgoing"]),
    customerInvoiceId: z.uuid().nullable().optional(),
    vendorInvoiceId: z.uuid().nullable().optional(),
    amount: z.coerce.number().finite().positive().multipleOf(0.01).max(9999999999999.99),
    method: z.enum(["cash", "transfer", "card", "other"]),
    reference: z.string().max(200).optional(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .refine(
    (value) =>
      value.direction === "incoming"
        ? Boolean(value.customerInvoiceId && !value.vendorInvoiceId)
        : Boolean(value.vendorInvoiceId && !value.customerInvoiceId),
    "Invoice tidak sesuai arah pembayaran",
  );

type PaymentInput = z.infer<typeof paymentInput>;
type ExistingPayment = {
  id: string;
  paymentNumber: string;
  direction: "incoming" | "outgoing";
  customerInvoiceId: string | null;
  vendorInvoiceId: string | null;
  amount: string;
  method: "cash" | "transfer" | "card" | "other";
  reference: string | null;
  reversedAt: string | null;
};

export function assertIdempotencyPayloadMatches(
  existing: ExistingPayment,
  input: PaymentInput,
) {
  const matches =
    existing.paymentNumber === input.paymentNumber &&
    existing.direction === input.direction &&
    existing.customerInvoiceId === (input.customerInvoiceId ?? null) &&
    existing.vendorInvoiceId === (input.vendorInvoiceId ?? null) &&
    Number(existing.amount) === input.amount &&
    existing.method === input.method &&
    existing.reference === (input.reference ?? null);
  if (!matches)
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Kunci idempotensi sudah digunakan untuk pembayaran dengan payload berbeda",
    );
}

export function assertVendorInvoicePayable(invoice?: {
  status: string;
  total: string;
}) {
  if (!invoice)
    throw new ApiError(
      404,
      "VENDOR_INVOICE_NOT_FOUND",
      "Invoice vendor tidak ditemukan",
    );
  if (!["posted", "partially_paid", "paid"].includes(invoice.status))
    throw new ApiError(
      409,
      "INVOICE_NOT_PAYABLE",
      "Invoice vendor tidak aktif untuk pembayaran",
    );
}

export function assertPaymentWithinOutstanding(
  amount: number,
  total: number,
  paid: number,
) {
  const outstanding = Math.max(Math.round(total * 100) - Math.round(paid * 100), 0);
  if (outstanding <= 0)
    throw new ApiError(409, "INVOICE_ALREADY_PAID", "Invoice vendor sudah lunas");
  if (Math.round(amount * 100) > outstanding)
    throw new ApiError(
      422,
      "PAYMENT_OVERPAY",
      "Pembayaran melebihi sisa invoice vendor",
    );
  return outstanding / 100;
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "finance.read");
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const result = await client.query<{ amount: string; [key: string]: unknown }>(
          `SELECT p.id,p.payment_number AS "paymentNumber",p.direction,p.customer_invoice_id AS "customerInvoiceId",ci.invoice_number AS "customerInvoiceNumber",p.vendor_invoice_id AS "vendorInvoiceId",vi.invoice_number AS "vendorInvoiceNumber",COALESCE(c.name,v.name) AS "counterpartyName",p.amount::text AS amount,p.method,p.reference,p.paid_at AS "paidAt",p.received_by AS "receivedBy",u.display_name AS "receivedByName",p.reversed_at AS "reversedAt",p.reversed_by AS "reversedBy",reversed_by.display_name AS "reversedByName",p.reversal_reason AS "reversalReason",CASE WHEN p.reversed_at IS NULL THEN 'posted' ELSE 'reversed' END AS status,p.reversed_at IS NOT NULL AS reversed FROM app.payments p LEFT JOIN app.customer_invoices ci ON ci.id=p.customer_invoice_id LEFT JOIN app.customers c ON c.id=ci.customer_id LEFT JOIN app.vendor_invoices vi ON vi.id=p.vendor_invoice_id LEFT JOIN app.vendors v ON v.id=vi.vendor_id LEFT JOIN app.users u ON u.id=p.received_by LEFT JOIN app.users reversed_by ON reversed_by.id=p.reversed_by ORDER BY p.paid_at DESC,p.created_at DESC LIMIT 200`,
        );
        return result.rows.map(({ amount, ...payment }) => ({ ...payment, amount: Number(amount) }));
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
    const user = await requirePermission(request, requestId, "finance.pay");
    const body = await parseBody(request, paymentInput);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `payment:${body.idempotencyKey}`,
        ]);
        const existing = (
          await client.query<ExistingPayment>(
            `SELECT id,payment_number AS "paymentNumber",direction,customer_invoice_id AS "customerInvoiceId",vendor_invoice_id AS "vendorInvoiceId",amount::text,method,reference,reversed_at AS "reversedAt"
             FROM app.payments WHERE idempotency_key=$1 FOR UPDATE`,
            [body.idempotencyKey],
          )
        ).rows[0];
        if (existing) {
          assertIdempotencyPayloadMatches(existing, body);
          if (existing.reversedAt)
            throw new ApiError(409, "PAYMENT_REVERSED", "Pembayaran dengan kunci ini telah direversal");
          return { id: existing.id, paymentNumber: existing.paymentNumber };
        }

        if (body.direction === "outgoing") {
          const invoice = (
            await client.query<{ id: string; status: string; total: string }>(
              "SELECT id,status,total::text FROM app.vendor_invoices WHERE id=$1 FOR UPDATE",
              [body.vendorInvoiceId],
            )
          ).rows[0];
          assertVendorInvoicePayable(invoice);
          const paid = Number(
            (
              await client.query<{ paid: string }>(
                "SELECT COALESCE(sum(amount),0)::text AS paid FROM app.payments WHERE vendor_invoice_id=$1 AND direction='outgoing' AND reversed_at IS NULL",
                [invoice.id],
              )
            ).rows[0].paid,
          );
          const total = Number(invoice.total);
          assertPaymentWithinOutstanding(body.amount, total, paid);
          const payment = (
            await client.query<{ id: string; paymentNumber: string }>(
              `INSERT INTO app.payments(payment_number,direction,vendor_invoice_id,amount,method,reference,received_by,idempotency_key)
               VALUES($1,'outgoing',$2,$3,$4,$5,$6,$7)
               RETURNING id,payment_number AS "paymentNumber"`,
              [body.paymentNumber, invoice.id, body.amount, body.method, body.reference ?? null, user.id, body.idempotencyKey],
            )
          ).rows[0];
          const invoiceStatus = Math.round((paid + body.amount) * 100) >= Math.round(total * 100) ? "paid" : "partially_paid";
          await client.query(
            "UPDATE app.vendor_invoices SET status=$1::app.invoice_status WHERE id=$2",
            [invoiceStatus, invoice.id],
          );
          await recordAudit(client, {
            actorId: user.id,
            requestId,
            action: "finance.vendor_invoice.payment",
            entityType: "payment",
            entityId: payment.id,
            after: {
              vendorInvoiceId: invoice.id,
              paymentNumber: payment.paymentNumber,
              amount: body.amount,
              method: body.method,
              invoiceStatus,
            },
          });
          return payment;
        }

        return (
          await client.query<{ id: string; paymentNumber: string }>(
            `INSERT INTO app.payments(payment_number,direction,customer_invoice_id,amount,method,reference,received_by,idempotency_key)
             VALUES($1,'incoming',$2,$3,$4,$5,$6,$7)
             RETURNING id,payment_number AS "paymentNumber"`,
            [body.paymentNumber, body.customerInvoiceId, body.amount, body.method, body.reference ?? null, user.id, body.idempotencyKey],
          )
        ).rows[0];
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
