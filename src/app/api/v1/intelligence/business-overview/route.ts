import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

const querySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const numeric = (value: unknown) => Number(value ?? 0);

function reportRange(request: NextRequest) {
  const query = querySchema.parse({
    from: request.nextUrl.searchParams.get("from") || undefined,
    to: request.nextUrl.searchParams.get("to") || undefined,
  });
  const now = new Date();
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : fallbackFrom;
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : now;
  if (to < from) throw new ApiError(422, "INVALID_DATE_RANGE", "Tanggal akhir tidak boleh sebelum tanggal awal");
  if (Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1 > 92) {
    throw new ApiError(422, "DATE_RANGE_TOO_LARGE", "Rentang laporan maksimal 92 hari");
  }
  const exclusiveTo = new Date(to);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    exclusiveTo: exclusiveTo.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "reports.read");
    const dates = reportRange(request);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const parameters = [dates.from, dates.exclusiveTo];
        const summary = (await client.query(`WITH invoice_lines AS (
          SELECT ii.item_type, COALESCE(SUM(ii.line_total),0) amount
          FROM app.customer_invoice_items ii
          JOIN app.customer_invoices i ON i.id=ii.invoice_id
          WHERE i.status<>'reversed' AND i.issued_at >= $1::date AND i.issued_at < $2::date
          GROUP BY ii.item_type
        ), pos_lines AS (
          SELECT CASE WHEN si.service_id IS NULL THEN 'product' ELSE 'service' END item_type, COALESCE(SUM(si.line_total),0) amount
          FROM app.pos_sale_items si
          JOIN app.pos_sales s ON s.id=si.sale_id
          WHERE s.status='completed' AND s.completed_at >= $1::date AND s.completed_at < $2::date
          GROUP BY CASE WHEN si.service_id IS NULL THEN 'product' ELSE 'service' END
        ), revenue AS (
          SELECT COALESCE(SUM(total),0) amount FROM app.customer_invoices WHERE status<>'reversed' AND issued_at >= $1::date AND issued_at < $2::date
          UNION ALL
          SELECT COALESCE(SUM(total),0) FROM app.pos_sales WHERE status='completed' AND completed_at >= $1::date AND completed_at < $2::date
        ), cogs AS (
          SELECT COALESCE(SUM(quantity*unit_cost),0) amount FROM app.service_order_parts WHERE consumed_at >= $1::date AND consumed_at < $2::date
          UNION ALL
          SELECT COALESCE(SUM(si.quantity*si.unit_cost),0) FROM app.pos_sale_items si JOIN app.pos_sales s ON s.id=si.sale_id WHERE s.status='completed' AND s.completed_at >= $1::date AND s.completed_at < $2::date
        ), active_customers AS (
          SELECT DISTINCT customer_id FROM app.service_orders WHERE opened_at >= $1::date AND opened_at < $2::date
        ), returning_customers AS (
          SELECT ac.customer_id FROM active_customers ac WHERE EXISTS (SELECT 1 FROM app.service_orders prior WHERE prior.customer_id=ac.customer_id AND prior.opened_at < $1::date)
        )
        SELECT
          COALESCE((SELECT SUM(amount) FROM revenue),0)::text AS "totalRevenue",
          COALESCE((SELECT SUM(amount) FROM cogs),0)::text AS "totalCogs",
          (COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE item_type='service'),0) + COALESCE((SELECT SUM(amount) FROM pos_lines WHERE item_type='service'),0))::text AS "serviceRevenue",
          (COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE item_type='product'),0) + COALESCE((SELECT SUM(amount) FROM pos_lines WHERE item_type='product'),0))::text AS "sparepartRevenue",
          (SELECT COUNT(*) FROM app.customers WHERE is_active)::int AS "totalCustomers",
          (SELECT COUNT(*) FROM active_customers)::int AS "activeCustomers",
          (SELECT COUNT(*) FROM returning_customers)::int AS "returningCustomers",
          (SELECT COUNT(*) FROM app.customer_follow_ups WHERE status<>'completed' AND due_at <= now())::int AS "overdueFollowUps",
          (SELECT COUNT(*) FROM app.service_reminders WHERE status<>'completed' AND due_at <= now())::int AS "dueReminders",
          (SELECT COUNT(*) FROM app.service_orders WHERE status NOT IN ('completed','cancelled'))::int AS "openOrders",
          (SELECT COALESCE(SUM(b.quantity*p.hpp),0) FROM app.inventory_balances b JOIN app.products p ON p.id=b.product_id)::text AS "inventoryValue"` , parameters)).rows[0];

        const mechanics = (await client.query(`WITH orders AS (
          SELECT assigned_mechanic_id mechanic_id,
            COUNT(*)::int "totalOrders",
            COUNT(*) FILTER (WHERE status='completed')::int completed,
            COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at-opened_at))/3600) FILTER (WHERE completed_at IS NOT NULL),0)::numeric(12,2)::text "averageHours"
          FROM app.service_orders
          WHERE assigned_mechanic_id IS NOT NULL AND opened_at >= $1::date AND opened_at < $2::date
          GROUP BY assigned_mechanic_id
        ), jobs AS (
          SELECT j.mechanic_id, COALESCE(SUM(j.price),0)::text "serviceValue"
          FROM app.service_order_jobs j
          JOIN app.service_orders s ON s.id=j.service_order_id
          WHERE j.mechanic_id IS NOT NULL AND s.opened_at >= $1::date AND s.opened_at < $2::date
          GROUP BY j.mechanic_id
        ), fees AS (
          SELECT mechanic_id, COALESCE(SUM(fee_amount),0)::text fees
          FROM app.mechanic_fees WHERE created_at >= $1::date AND created_at < $2::date GROUP BY mechanic_id
        ), qc AS (
          SELECT s.assigned_mechanic_id mechanic_id,
            COUNT(q.id) FILTER (WHERE q.passed)::int passed,
            COUNT(q.id)::int total
          FROM app.service_orders s LEFT JOIN app.quality_checks q ON q.service_order_id=s.id
          WHERE s.assigned_mechanic_id IS NOT NULL AND s.opened_at >= $1::date AND s.opened_at < $2::date
          GROUP BY s.assigned_mechanic_id
        )
        SELECT u.id,u.display_name name,m.employee_code "employeeCode",m.is_active "isActive",
          COALESCE(o."totalOrders",0)::int "totalOrders",COALESCE(o.completed,0)::int completed,
          COALESCE(o."averageHours",'0') "averageHours",COALESCE(j."serviceValue",'0') "serviceValue",COALESCE(f.fees,'0') fees,
          CASE WHEN COALESCE(q.total,0)>0 THEN ROUND(q.passed::numeric/q.total*100,1) ELSE NULL END "qualityPassRate"
        FROM app.mechanics m JOIN app.users u ON u.id=m.user_id
        LEFT JOIN orders o ON o.mechanic_id=m.user_id LEFT JOIN jobs j ON j.mechanic_id=m.user_id
        LEFT JOIN fees f ON f.mechanic_id=m.user_id LEFT JOIN qc q ON q.mechanic_id=m.user_id
        WHERE m.is_active ORDER BY COALESCE(o.completed,0) DESC,COALESCE(j."serviceValue"::numeric,0) DESC LIMIT 8`, parameters)).rows.map((row) => ({
          ...row,
          averageHours: numeric(row.averageHours), serviceValue: numeric(row.serviceValue), fees: numeric(row.fees), qualityPassRate: row.qualityPassRate === null ? null : numeric(row.qualityPassRate),
        }));

        const topParts = (await client.query(`SELECT p.id,p.part_code "partCode",p.name,COALESCE(SUM(usage.quantity),0)::text quantity
          FROM (
            SELECT product_id,quantity FROM app.service_order_parts WHERE consumed_at >= $1::date AND consumed_at < $2::date
            UNION ALL
            SELECT si.product_id,si.quantity FROM app.pos_sale_items si JOIN app.pos_sales s ON s.id=si.sale_id WHERE s.status='completed' AND s.completed_at >= $1::date AND s.completed_at < $2::date
          ) usage JOIN app.products p ON p.id=usage.product_id
          GROUP BY p.id,p.part_code,p.name ORDER BY SUM(usage.quantity) DESC,p.name LIMIT 5`, parameters)).rows.map((row) => ({ ...row, quantity: numeric(row.quantity) }));

        const slowMoving = (await client.query(`WITH used AS (
          SELECT product_id,COALESCE(SUM(quantity),0) quantity FROM app.service_order_parts
          WHERE consumed_at >= now()-interval '90 days' GROUP BY product_id
          UNION ALL
          SELECT si.product_id,COALESCE(SUM(si.quantity),0) FROM app.pos_sale_items si
          JOIN app.pos_sales s ON s.id=si.sale_id
          WHERE s.status='completed' AND s.completed_at >= now()-interval '90 days' GROUP BY si.product_id
        ), total_used AS (
          SELECT product_id,SUM(quantity) quantity FROM used GROUP BY product_id
        ) SELECT p.id,p.part_code "partCode",p.name,COALESCE(SUM(b.quantity),0)::text quantity,COALESCE(u.quantity,0)::text "usedLast90Days"
          FROM app.inventory_balances b JOIN app.products p ON p.id=b.product_id LEFT JOIN total_used u ON u.product_id=p.id
          WHERE b.quantity > 0 GROUP BY p.id,p.part_code,p.name,u.quantity
          ORDER BY COALESCE(u.quantity,0),SUM(b.quantity) DESC,p.name LIMIT 5`)).rows.map((row) => ({ ...row, quantity: numeric(row.quantity), usedLast90Days: numeric(row.usedLast90Days) }));

        const trend = (await client.query(`WITH days AS (
          SELECT generate_series($1::date,$2::date-interval '1 day',interval '1 day')::date bucket
        ), entries AS (
          SELECT i.issued_at::date bucket,CASE WHEN ii.item_type='service' THEN ii.line_total ELSE 0 END service,CASE WHEN ii.item_type='product' THEN ii.line_total ELSE 0 END sparepart
          FROM app.customer_invoice_items ii JOIN app.customer_invoices i ON i.id=ii.invoice_id WHERE i.status<>'reversed' AND i.issued_at >= $1::date AND i.issued_at < $2::date
          UNION ALL
          SELECT s.completed_at::date,CASE WHEN si.service_id IS NOT NULL THEN si.line_total ELSE 0 END,CASE WHEN si.service_id IS NULL THEN si.line_total ELSE 0 END
          FROM app.pos_sale_items si JOIN app.pos_sales s ON s.id=si.sale_id WHERE s.status='completed' AND s.completed_at >= $1::date AND s.completed_at < $2::date
        ) SELECT d.bucket::text date,COALESCE(SUM(e.service),0)::text service,COALESCE(SUM(e.sparepart),0)::text sparepart FROM days d LEFT JOIN entries e ON e.bucket=d.bucket GROUP BY d.bucket ORDER BY d.bucket`, parameters)).rows.map((row) => ({ date: row.date, service: numeric(row.service), sparepart: numeric(row.sparepart) }));

        const totalRevenue = numeric(summary.totalRevenue);
        const totalCogs = numeric(summary.totalCogs);
        const inventoryValue = numeric(summary.inventoryValue);
        return {
          range: { from: dates.from, to: dates.to },
          summary: {
            ...summary,
            totalRevenue,
            totalCogs,
            serviceRevenue: numeric(summary.serviceRevenue),
            sparepartRevenue: numeric(summary.sparepartRevenue),
            inventoryValue,
            grossProfit: totalRevenue - totalCogs,
            grossMarginPercent: totalRevenue ? Number((((totalRevenue - totalCogs) / totalRevenue) * 100).toFixed(2)) : 0,
            repeatServicePercent: numeric(summary.activeCustomers) ? Number(((numeric(summary.returningCustomers) / numeric(summary.activeCustomers)) * 100).toFixed(1)) : 0,
            inventoryTurnover: inventoryValue ? Number((totalCogs / inventoryValue).toFixed(2)) : 0,
          },
          mechanics,
          topParts,
          slowMoving,
          trend,
        };
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
