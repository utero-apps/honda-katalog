import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

const querySchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const numeric = (value: unknown) => Number(value ?? 0);

function reportRange(request: NextRequest) {
  const query = querySchema.parse({ from: request.nextUrl.searchParams.get("from") || undefined, to: request.nextUrl.searchParams.get("to") || undefined });
  const now = new Date();
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = query.from ? new Date(query.from + "T00:00:00.000Z") : fallbackFrom;
  const to = query.to ? new Date(query.to + "T00:00:00.000Z") : now;
  if (to < from) throw new ApiError(422, "INVALID_DATE_RANGE", "Tanggal akhir tidak boleh sebelum tanggal awal");
  if (Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1 > 92) throw new ApiError(422, "DATE_RANGE_TOO_LARGE", "Rentang laporan maksimal 92 hari");
  const exclusiveTo = new Date(to);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), exclusiveTo: exclusiveTo.toISOString().slice(0, 10) };
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "finance.read");
    const dates = reportRange(request);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const parameters = [dates.from, dates.exclusiveTo];
      const summaryRow = (await client.query(`WITH revenue AS (
        SELECT COALESCE(SUM(total),0) amount FROM app.customer_invoices WHERE status<>'reversed' AND issued_at >= $1::date AND issued_at < $2::date
        UNION ALL SELECT COALESCE(SUM(total),0) FROM app.pos_sales WHERE status='completed' AND completed_at >= $1::date AND completed_at < $2::date
      ), cogs AS (
        SELECT COALESCE(SUM(quantity*unit_cost),0) amount FROM app.service_order_parts WHERE consumed_at >= $1::date AND consumed_at < $2::date
        UNION ALL SELECT COALESCE(SUM(i.quantity*i.unit_cost),0) FROM app.pos_sale_items i JOIN app.pos_sales s ON s.id=i.sale_id WHERE s.status='completed' AND s.completed_at >= $1::date AND s.completed_at < $2::date
      ), operating AS (
        SELECT COALESCE(SUM(amount),0) amount FROM app.expenses WHERE occurred_at >= $1::date AND occurred_at < $2::date
      ), cash AS (
        SELECT COALESCE(SUM(amount) FILTER (WHERE direction='incoming' AND reversed_at IS NULL),0) incoming, COALESCE(SUM(amount) FILTER (WHERE direction='outgoing' AND reversed_at IS NULL),0) outgoing FROM app.payments WHERE paid_at >= $1::date AND paid_at < $2::date
      ), receivables AS (
        SELECT COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)),0) amount FROM app.customer_invoices i LEFT JOIN (SELECT customer_invoice_id,SUM(amount) FILTER (WHERE reversed_at IS NULL) paid FROM app.payments GROUP BY customer_invoice_id) p ON p.customer_invoice_id=i.id WHERE i.status<>'reversed'
      ), payables AS (
        SELECT COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)),0) amount, COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)) FILTER (WHERE i.due_at < current_date),0) overdue FROM app.vendor_invoices i LEFT JOIN (SELECT vendor_invoice_id,SUM(amount) FILTER (WHERE reversed_at IS NULL) paid FROM app.payments GROUP BY vendor_invoice_id) p ON p.vendor_invoice_id=i.id WHERE i.status<>'reversed'
      ) SELECT COALESCE((SELECT SUM(amount) FROM revenue),0)::text AS "totalIncome", COALESCE((SELECT SUM(amount) FROM cogs),0)::text AS "totalCogs", (SELECT amount FROM operating)::text AS "operatingExpense", (SELECT incoming FROM cash)::text AS "incomingCash", (SELECT outgoing FROM cash)::text AS "outgoingCash", (SELECT amount FROM receivables)::text AS receivables, (SELECT amount FROM payables)::text AS payables, (SELECT overdue FROM payables)::text AS "overduePayables"`, parameters)).rows[0];
      const totalIncome = numeric(summaryRow.totalIncome), totalCogs = numeric(summaryRow.totalCogs), operatingExpense = numeric(summaryRow.operatingExpense), grossProfit = totalIncome - totalCogs, netProfit = grossProfit - operatingExpense;
      const trend = (await client.query(`WITH days AS (SELECT generate_series($1::date,$2::date-interval '1 day',interval '1 day')::date AS bucket), revenue AS (SELECT issued_at::date AS bucket,SUM(total) amount FROM app.customer_invoices WHERE status<>'reversed' AND issued_at >= $1::date AND issued_at < $2::date GROUP BY issued_at::date UNION ALL SELECT completed_at::date,SUM(total) FROM app.pos_sales WHERE status='completed' AND completed_at >= $1::date AND completed_at < $2::date GROUP BY completed_at::date), costs AS (SELECT consumed_at::date AS bucket,SUM(quantity*unit_cost) amount FROM app.service_order_parts WHERE consumed_at >= $1::date AND consumed_at < $2::date GROUP BY consumed_at::date UNION ALL SELECT occurred_at::date,SUM(amount) FROM app.expenses WHERE occurred_at >= $1::date AND occurred_at < $2::date GROUP BY occurred_at::date) SELECT to_char(d.bucket,'YYYY-MM-DD') date,COALESCE((SELECT SUM(amount) FROM revenue WHERE bucket=d.bucket),0)::text income,COALESCE((SELECT SUM(amount) FROM costs WHERE bucket=d.bucket),0)::text expense FROM days d ORDER BY d.bucket`, parameters)).rows.map((row) => ({ date: row.date, income: numeric(row.income), expense: numeric(row.expense), profit: numeric(row.income) - numeric(row.expense) }));
      const incomeComposition = (await client.query(`SELECT category,SUM(amount)::text amount FROM (SELECT CASE item_type WHEN 'service' THEN 'Service' WHEN 'product' THEN 'Sparepart' ELSE 'Lainnya' END category,SUM(ii.line_total) amount FROM app.customer_invoice_items ii JOIN app.customer_invoices i ON i.id=ii.invoice_id WHERE i.status<>'reversed' AND i.issued_at >= $1::date AND i.issued_at < $2::date GROUP BY item_type UNION ALL SELECT CASE WHEN si.service_id IS NOT NULL THEN 'Service' ELSE 'Sparepart' END,SUM(si.line_total) FROM app.pos_sale_items si JOIN app.pos_sales s ON s.id=si.sale_id WHERE s.status='completed' AND s.completed_at >= $1::date AND s.completed_at < $2::date GROUP BY CASE WHEN si.service_id IS NOT NULL THEN 'Service' ELSE 'Sparepart' END) items GROUP BY category ORDER BY SUM(amount) DESC`, parameters)).rows.map((row) => ({ category: row.category, amount: numeric(row.amount) }));
      const expenseComposition = (await client.query(`SELECT category,SUM(amount)::text amount FROM (SELECT 'HPP Sparepart' category,SUM(quantity*unit_cost) amount FROM app.service_order_parts WHERE consumed_at >= $1::date AND consumed_at < $2::date UNION ALL SELECT category,SUM(amount) FROM app.expenses WHERE occurred_at >= $1::date AND occurred_at < $2::date GROUP BY category) items WHERE amount IS NOT NULL GROUP BY category ORDER BY SUM(amount) DESC`, parameters)).rows.map((row) => ({ category: row.category, amount: numeric(row.amount) }));
      const payableVendors = (await client.query(`SELECT v.id,v.name vendor,SUM(GREATEST(i.total-COALESCE(p.paid,0),0))::text total,COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)) FILTER (WHERE i.due_at>=current_date),0)::text "notDue",COALESCE(SUM(GREATEST(i.total-COALESCE(p.paid,0),0)) FILTER (WHERE i.due_at<current_date),0)::text overdue,MIN(i.due_at) FILTER (WHERE GREATEST(i.total-COALESCE(p.paid,0),0)>0) "nearestDueAt" FROM app.vendor_invoices i JOIN app.vendors v ON v.id=i.vendor_id LEFT JOIN (SELECT vendor_invoice_id,SUM(amount) FILTER (WHERE reversed_at IS NULL) paid FROM app.payments GROUP BY vendor_invoice_id) p ON p.vendor_invoice_id=i.id WHERE i.status<>'reversed' GROUP BY v.id,v.name HAVING SUM(GREATEST(i.total-COALESCE(p.paid,0),0))>0 ORDER BY SUM(GREATEST(i.total-COALESCE(p.paid,0),0)) DESC LIMIT 8`)).rows.map((row) => ({ ...row, total: numeric(row.total), notDue: numeric(row.notDue), overdue: numeric(row.overdue) }));
      const activity = (await client.query(`SELECT * FROM (SELECT 'income' kind,i.invoice_number reference,c.name counterparty,i.total::text amount,i.issued_at occurred_at FROM app.customer_invoices i JOIN app.customers c ON c.id=i.customer_id WHERE i.status<>'reversed' UNION ALL SELECT 'expense',e.expense_number,e.category,e.amount::text,e.occurred_at FROM app.expenses e UNION ALL SELECT 'payable',i.invoice_number,v.name,i.total::text,i.issued_at::timestamptz FROM app.vendor_invoices i JOIN app.vendors v ON v.id=i.vendor_id WHERE i.status<>'reversed') entries ORDER BY occurred_at DESC NULLS LAST LIMIT 10`)).rows.map((row) => ({ ...row, amount: numeric(row.amount) }));
      return { range: { from: dates.from, to: dates.to }, summary: { totalIncome, totalCogs, operatingExpense, totalExpense: totalCogs + operatingExpense, grossProfit, netProfit, grossMarginPercent: totalIncome ? Number(((grossProfit / totalIncome) * 100).toFixed(2)) : 0, netMarginPercent: totalIncome ? Number(((netProfit / totalIncome) * 100).toFixed(2)) : 0, incomingCash: numeric(summaryRow.incomingCash), outgoingCash: numeric(summaryRow.outgoingCash), receivables: numeric(summaryRow.receivables), payables: numeric(summaryRow.payables), overduePayables: numeric(summaryRow.overduePayables) }, trend, incomeComposition, expenseComposition, payableVendors, activity };
    });
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
