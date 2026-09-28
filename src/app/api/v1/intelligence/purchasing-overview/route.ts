import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

const querySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const permissions = ["purchasing.read", "finance.read"];

function numeric(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function reportRange(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const query = querySchema.parse({
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  });
  const now = new Date();
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : fallbackFrom;
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : now;
  if (to < from) {
    throw new ApiError(422, "INVALID_DATE_RANGE", "Tanggal akhir tidak boleh sebelum tanggal awal");
  }
  if (Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1 > 366) {
    throw new ApiError(422, "DATE_RANGE_TOO_LARGE", "Rentang laporan maksimal 366 hari");
  }
  const exclusiveTo = new Date(to);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    exclusiveTo: exclusiveTo.toISOString().slice(0, 10),
  };
}

async function requirePurchasingOrFinance(request: NextRequest, requestId: string) {
  const { user } = await requireUser(request, requestId);
  const allowed = await withActorTransaction(
    { userId: user.id, role: user.role, requestId },
    async (client) => {
      const result = await client.query(
        "SELECT 1 FROM app.role_permissions WHERE role=$1 AND permission_code=ANY($2::text[]) LIMIT 1",
        [user.role, permissions],
      );
      return (result.rowCount ?? 0) > 0;
    },
  );
  if (!allowed) {
    throw new ApiError(403, "FORBIDDEN", "Anda tidak memiliki izin untuk tindakan ini");
  }
  return user;
}

function normalizeInvoice(invoice: Record<string, unknown>) {
  return {
    ...invoice,
    total: numeric(invoice.total),
    paid: numeric(invoice.paid),
    outstanding: numeric(invoice.outstanding),
  };
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePurchasingOrFinance(request, requestId);
    const canViewFinance = ["owner", "admin", "finance"].includes(user.role);
    const range = reportRange(request);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const parameters = [range.from, range.exclusiveTo, range.to];
        const queries = [
          () => client.query(
            `WITH purchase_totals AS (
              SELECT po.id,COALESCE(SUM(poi.ordered_quantity*poi.unit_price),0) total
              FROM app.purchase_orders po
              LEFT JOIN app.purchase_order_items poi ON poi.purchase_order_id=po.id
              WHERE po.order_date >= $1::date AND po.order_date < $2::date
                AND po.status NOT IN ('rejected','cancelled')
              GROUP BY po.id
            ), receipt_totals AS (
              SELECT gr.id,COALESCE(SUM(gri.quantity*gri.unit_cost),0) total
              FROM app.goods_receipts gr
              LEFT JOIN app.goods_receipt_items gri ON gri.goods_receipt_id=gr.id
              WHERE gr.received_at >= $1::date AND gr.received_at < $2::date
              GROUP BY gr.id
            ), invoice_balances AS (
              SELECT i.id,i.total,COALESCE(SUM(p.amount) FILTER (WHERE p.direction='outgoing' AND p.reversed_at IS NULL AND p.paid_at < $2::date),0) paid
              FROM app.vendor_invoices i
              LEFT JOIN app.payments p ON p.vendor_invoice_id=i.id
              WHERE i.status<>'reversed' AND i.issued_at < $2::date
              GROUP BY i.id,i.total
            )
            SELECT
              (SELECT COUNT(*) FROM purchase_totals)::int AS "totalPurchaseOrders",
              (SELECT COALESCE(SUM(total),0) FROM purchase_totals)::text AS "purchaseValue",
              (SELECT COUNT(*) FROM receipt_totals)::int AS "totalReceipts",
              (SELECT COALESCE(SUM(total),0) FROM receipt_totals)::text AS "receivingValue",
              (SELECT COALESCE(SUM(GREATEST(total-paid,0)),0) FROM invoice_balances)::text AS "outstandingVendorDebt",
              (SELECT COALESCE(SUM(p.amount),0) FROM app.payments p WHERE p.direction='outgoing' AND p.vendor_invoice_id IS NOT NULL AND p.reversed_at IS NULL AND p.paid_at >= $1::date AND p.paid_at < $2::date)::text AS "outgoingVendorPayments"`,
            parameters.slice(0, 2),
          ),
          () => client.query(
            `WITH purchase_totals AS (
              SELECT purchase_order_id,COALESCE(SUM(ordered_quantity*unit_price),0) total
              FROM app.purchase_order_items GROUP BY purchase_order_id
            ), receipt_totals AS (
              SELECT gr.purchase_order_id,COUNT(DISTINCT gr.id)::int "receiptCount",COALESCE(SUM(gri.quantity),0) "receivedQuantity",COALESCE(SUM(gri.quantity*gri.unit_cost),0) "receivedValue",MAX(gr.received_at) "lastReceivedAt"
              FROM app.goods_receipts gr
              LEFT JOIN app.goods_receipt_items gri ON gri.goods_receipt_id=gr.id
              GROUP BY gr.purchase_order_id
            ), invoice_balances AS (
              SELECT i.id,i.purchase_order_id,i.invoice_number,i.status,i.total,i.issued_at,i.created_at,COALESCE(SUM(p.amount) FILTER (WHERE p.direction='outgoing' AND p.reversed_at IS NULL AND p.paid_at < $2::date),0) paid
              FROM app.vendor_invoices i
              LEFT JOIN app.payments p ON p.vendor_invoice_id=i.id
              WHERE i.status<>'reversed' AND i.issued_at < $2::date
              GROUP BY i.id,i.purchase_order_id,i.invoice_number,i.status,i.total,i.issued_at,i.created_at
            ), invoice_aggregates AS (
              SELECT purchase_order_id,COALESCE(SUM(GREATEST(total-paid,0)),0) outstanding,
                COALESCE(jsonb_agg(jsonb_build_object('id',id,'invoiceNumber',invoice_number,'status',status,'total',total,'paid',paid,'outstanding',GREATEST(total-paid,0),'paymentStatus',CASE WHEN GREATEST(total-paid,0)=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' ELSE 'unpaid' END) ORDER BY issued_at DESC,created_at DESC),'[]'::jsonb) AS invoices
              FROM invoice_balances WHERE purchase_order_id IS NOT NULL GROUP BY purchase_order_id
            ), latest_invoices AS (
              SELECT DISTINCT ON (purchase_order_id) purchase_order_id,invoice_number,total,paid,GREATEST(total-paid,0) outstanding,
                CASE WHEN GREATEST(total-paid,0)=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' ELSE 'unpaid' END AS "paymentStatus"
              FROM invoice_balances WHERE purchase_order_id IS NOT NULL
              ORDER BY purchase_order_id,issued_at DESC,created_at DESC
            )
            SELECT po.id AS "purchaseOrderId",po.order_number AS "purchaseOrderNumber",po.order_date AS "orderDate",po.expected_date AS "expectedDate",po.status,po.status AS "purchaseOrderStatus",v.id AS "vendorId",v.name AS "vendorName",
              COALESCE(pt.total,0)::text AS total,COALESCE(rt."receiptCount",0)::int AS "receiptCount",COALESCE(rt."receivedQuantity",0)::text AS "receivedQuantity",COALESCE(rt."receivedValue",0)::text AS "receivedValue",rt."lastReceivedAt",
              rt."lastReceivedAt" AS "receivedAt",COALESCE(ia.outstanding,0)::text AS "purchaseOrderOutstanding",li.invoice_number AS "invoiceNumber",li.total::text AS "invoiceTotal",li.outstanding::text AS outstanding,li."paymentStatus",COALESCE(ia.invoices,'[]'::jsonb) AS invoices
            FROM app.purchase_orders po
            JOIN app.vendors v ON v.id=po.vendor_id
            LEFT JOIN purchase_totals pt ON pt.purchase_order_id=po.id
            LEFT JOIN receipt_totals rt ON rt.purchase_order_id=po.id
            LEFT JOIN invoice_aggregates ia ON ia.purchase_order_id=po.id
            LEFT JOIN latest_invoices li ON li.purchase_order_id=po.id
            WHERE po.order_date >= $1::date AND po.order_date < $2::date
            ORDER BY po.order_date DESC,po.created_at DESC LIMIT 20`,
            parameters.slice(0, 2),
          ),
          () => client.query(
            `WITH purchase_totals AS (
              SELECT po.id,po.vendor_id,COALESCE(SUM(poi.ordered_quantity*poi.unit_price),0) total
              FROM app.purchase_orders po
              LEFT JOIN app.purchase_order_items poi ON poi.purchase_order_id=po.id
              WHERE po.order_date >= $1::date AND po.order_date < $2::date
                AND po.status NOT IN ('rejected','cancelled')
              GROUP BY po.id,po.vendor_id
            ), receipt_totals AS (
              SELECT po.vendor_id,COALESCE(SUM(gri.quantity*gri.unit_cost),0) total
              FROM app.goods_receipts gr
              JOIN app.purchase_orders po ON po.id=gr.purchase_order_id
              JOIN app.goods_receipt_items gri ON gri.goods_receipt_id=gr.id
              WHERE gr.received_at >= $1::date AND gr.received_at < $2::date
              GROUP BY po.vendor_id
            ), invoice_balances AS (
              SELECT i.vendor_id,COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)),0) outstanding
              FROM app.vendor_invoices i
              LEFT JOIN (SELECT vendor_invoice_id,SUM(amount) FILTER (WHERE direction='outgoing' AND reversed_at IS NULL AND paid_at < $2::date) paid FROM app.payments GROUP BY vendor_invoice_id) p ON p.vendor_invoice_id=i.id
              WHERE i.status<>'reversed' AND i.issued_at < $2::date
              GROUP BY i.vendor_id
            )
            SELECT v.id AS "vendorId",v.code,v.name,COUNT(pt.id)::int AS "purchaseOrderCount",COALESCE(SUM(pt.total),0)::text AS "purchaseValue",COALESCE(rt.total,0)::text AS "receivingValue",COALESCE(ib.outstanding,0)::text AS outstanding
            FROM purchase_totals pt
            JOIN app.vendors v ON v.id=pt.vendor_id
            LEFT JOIN receipt_totals rt ON rt.vendor_id=v.id
            LEFT JOIN invoice_balances ib ON ib.vendor_id=v.id
            GROUP BY v.id,v.code,v.name,rt.total,ib.outstanding
            ORDER BY SUM(pt.total) DESC,v.name LIMIT 8`,
            parameters.slice(0, 2),
          ),
          () => client.query(
            `WITH invoice_balances AS (
              SELECT i.due_at,GREATEST(i.total-COALESCE(SUM(p.amount) FILTER (WHERE p.direction='outgoing' AND p.reversed_at IS NULL AND p.paid_at < $1::date),0),0) balance
              FROM app.vendor_invoices i
              LEFT JOIN app.payments p ON p.vendor_invoice_id=i.id
              WHERE i.status<>'reversed' AND i.issued_at < $1::date
              GROUP BY i.id,i.due_at,i.total
            )
            SELECT
              COALESCE(SUM(balance) FILTER (WHERE due_at IS NULL OR due_at >= $2::date),0)::text AS "notDue",
              COALESCE(SUM(balance) FILTER (WHERE $2::date-due_at BETWEEN 1 AND 30),0)::text AS "overdue1To30",
              COALESCE(SUM(balance) FILTER (WHERE $2::date-due_at BETWEEN 31 AND 60),0)::text AS "overdue31To60",
              COALESCE(SUM(balance) FILTER (WHERE $2::date-due_at > 60),0)::text AS "overdue61Plus"
            FROM invoice_balances WHERE balance>0`,
            [range.exclusiveTo, range.to],
          ),
          () => client.query(
            `WITH invoice_balances AS (
              SELECT i.id,i.total,COALESCE(SUM(p.amount) FILTER (WHERE p.direction='outgoing' AND p.reversed_at IS NULL AND p.paid_at < $2::date),0) paid
              FROM app.vendor_invoices i
              LEFT JOIN app.payments p ON p.vendor_invoice_id=i.id
              WHERE i.status<>'reversed' AND i.issued_at >= $1::date AND i.issued_at < $2::date
              GROUP BY i.id,i.total
            )
            SELECT CASE WHEN GREATEST(total-paid,0)=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' ELSE 'unpaid' END AS status,COUNT(*)::int AS count,COALESCE(SUM(total),0)::text AS total,COALESCE(SUM(GREATEST(total-paid,0)),0)::text AS outstanding
            FROM invoice_balances
            GROUP BY CASE WHEN GREATEST(total-paid,0)=0 THEN 'paid' WHEN paid>0 THEN 'partially_paid' ELSE 'unpaid' END
            ORDER BY status`,
            parameters.slice(0, 2),
          ),
        ];
        const results = [];
        for (const query of queries) results.push(await query());
        const [summaryResult, chainResult, vendorsResult, agingResult, compositionResult] = results;

        const summary = summaryResult.rows[0] ?? {};
        const aging = agingResult.rows[0] ?? {};
        return {
          range: { from: range.from, to: range.to },
          summary: {
            totalPurchaseOrders: numeric(summary.totalPurchaseOrders),
            totalReceipts: numeric(summary.totalReceipts),
            purchaseValue: numeric(summary.purchaseValue),
            receivingValue: numeric(summary.receivingValue),
            outstandingVendorDebt: canViewFinance ? numeric(summary.outstandingVendorDebt) : null,
            outgoingVendorPayments: canViewFinance ? numeric(summary.outgoingVendorPayments) : null,
          },
          recentPurchaseChain: chainResult.rows.map((row) => ({
            ...row,
            total: numeric(row.total),
            receivedQuantity: numeric(row.receivedQuantity),
            receivedValue: numeric(row.receivedValue),
            outstanding: canViewFinance && row.invoiceNumber ? numeric(row.outstanding) : null,
            purchaseOrderOutstanding: canViewFinance ? numeric(row.purchaseOrderOutstanding) : null,
            invoiceTotal: canViewFinance && row.invoiceNumber ? numeric(row.invoiceTotal) : null,
            invoiceNumber: canViewFinance ? row.invoiceNumber : null,
            paymentStatus: canViewFinance ? row.paymentStatus : null,
            invoices: canViewFinance && Array.isArray(row.invoices)
              ? row.invoices.map((invoice: Record<string, unknown>) => normalizeInvoice(invoice))
              : [],
          })),
          topVendors: vendorsResult.rows.map((row) => ({
            ...row,
            purchaseValue: numeric(row.purchaseValue),
            receivingValue: numeric(row.receivingValue),
            outstanding: canViewFinance ? numeric(row.outstanding) : null,
          })),
          payableAging: canViewFinance ? {
            notDue: numeric(aging.notDue),
            overdue1To30: numeric(aging.overdue1To30),
            overdue31To60: numeric(aging.overdue31To60),
            overdue61Plus: numeric(aging.overdue61Plus),
          } : null,
          paymentStatusComposition: canViewFinance ? compositionResult.rows.map((row) => ({
            ...row,
            total: numeric(row.total),
            outstanding: numeric(row.outstanding),
          })) : [],
        };
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
