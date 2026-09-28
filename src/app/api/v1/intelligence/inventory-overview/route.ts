import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

const querySchema = z.object({
  warehouseId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const numeric = (value: unknown) => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};

const canViewCost = (role: string) => ["owner", "admin", "finance"].includes(role);

function queryRange(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const query = querySchema.parse({
    warehouseId: searchParams.get("warehouseId") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  });
  const now = new Date();
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : fallbackFrom;
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : now;
  if (to < from) throw new ApiError(422, "INVALID_DATE_RANGE", "Tanggal akhir tidak boleh sebelum tanggal awal");
  if (Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1 > 366) {
    throw new ApiError(422, "DATE_RANGE_TOO_LARGE", "Rentang laporan maksimal 366 hari");
  }
  const exclusiveTo = new Date(to);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  return {
    warehouseId: query.warehouseId ?? null,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    exclusiveTo: exclusiveTo.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "inventory.read");
    const showCost = canViewCost(user.role);
    const range = queryRange(request);
    const parameters = [range.warehouseId, range.from, range.exclusiveTo];
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const summaryRow = (await client.query(
          `WITH balances AS (
             SELECT b.product_id,b.quantity,p.hpp,p.minimum_stock
             FROM app.inventory_balances b
             JOIN app.products p ON p.id=b.product_id
             WHERE ($1::uuid IS NULL OR b.warehouse_id=$1)
           ), movements AS (
             SELECT quantity,unit_cost
             FROM app.stock_movements
             WHERE ($1::uuid IS NULL OR warehouse_id=$1)
               AND occurred_at >= $2::date AND occurred_at < $3::date
           )
           SELECT COUNT(DISTINCT product_id)::int AS "totalItems",
             COALESCE(SUM(quantity*hpp),0)::text AS "inventoryValue",
             COALESCE((SELECT SUM(quantity*unit_cost) FILTER (WHERE quantity>0) FROM movements),0)::text AS "incomingValue",
             COALESCE(ABS((SELECT SUM(quantity*unit_cost) FILTER (WHERE quantity<0) FROM movements)),0)::text AS "outgoingValue",
             COALESCE((SELECT COUNT(*) FILTER (WHERE quantity>0) FROM movements),0)::int AS "incomingTransactions",
             COALESCE((SELECT COUNT(*) FILTER (WHERE quantity<0) FROM movements),0)::int AS "outgoingTransactions",
             COUNT(*) FILTER (WHERE quantity<=minimum_stock)::int AS "lowStockCount"
           FROM balances`,
          parameters,
        )).rows[0];

        const stockOverview = (await client.query(
          `SELECT w.id AS "warehouseId",w.code AS "warehouseCode",w.name AS "warehouseName",
             COUNT(DISTINCT b.product_id)::int AS "totalItems",
             COALESCE(SUM(b.quantity),0)::text AS quantity,
             COALESCE(SUM(b.reserved_quantity),0)::text AS "reservedQuantity",
             COALESCE(SUM(b.quantity-b.reserved_quantity),0)::text AS "availableQuantity",
             COALESCE(SUM(b.quantity*p.hpp),0)::text AS value,
             COUNT(*) FILTER (WHERE b.quantity<=p.minimum_stock)::int AS "lowStockCount"
           FROM app.warehouses w
           LEFT JOIN app.inventory_balances b ON b.warehouse_id=w.id
           LEFT JOIN app.products p ON p.id=b.product_id
           WHERE w.is_active=true AND ($1::uuid IS NULL OR w.id=$1)
           GROUP BY w.id,w.code,w.name ORDER BY w.name`,
          [range.warehouseId],
        )).rows.map((row) => ({
          ...row,
          quantity: numeric(row.quantity), reservedQuantity: numeric(row.reservedQuantity),
          availableQuantity: numeric(row.availableQuantity), value: numeric(row.value),
        }));

        const movementTrend = (await client.query(
          `WITH days AS (
             SELECT generate_series($2::date,$3::date-interval '1 day',interval '1 day')::date AS bucket
           ), movements AS (
             SELECT occurred_at::date AS bucket,quantity,unit_cost
             FROM app.stock_movements
             WHERE ($1::uuid IS NULL OR warehouse_id=$1)
               AND occurred_at >= $2::date AND occurred_at < $3::date
           )
           SELECT to_char(d.bucket,'YYYY-MM-DD') AS date,
             COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity>0),0)::text AS incoming,
             COALESCE(ABS(SUM(m.quantity) FILTER (WHERE m.quantity<0)),0)::text AS outgoing,
             COALESCE(SUM(m.quantity*m.unit_cost) FILTER (WHERE m.quantity>0),0)::text AS "incomingValue",
             COALESCE(ABS(SUM(m.quantity*m.unit_cost) FILTER (WHERE m.quantity<0)),0)::text AS "outgoingValue"
           FROM days d LEFT JOIN movements m ON m.bucket=d.bucket
           GROUP BY d.bucket ORDER BY d.bucket`,
          parameters,
        )).rows.map((row) => ({
          date: row.date, incoming: numeric(row.incoming), outgoing: numeric(row.outgoing),
          incomingValue: numeric(row.incomingValue), outgoingValue: numeric(row.outgoingValue),
        }));

        const topUsed = (await client.query(
          `SELECT p.id AS "productId",p.part_code AS "partCode",p.name,p.unit,
             ABS(SUM(m.quantity))::text AS quantity,
             ABS(SUM(m.quantity*m.unit_cost))::text AS value,
             COUNT(*)::int AS transactions
           FROM app.stock_movements m JOIN app.products p ON p.id=m.product_id
           WHERE m.quantity<0 AND ($1::uuid IS NULL OR m.warehouse_id=$1)
             AND m.occurred_at >= $2::date AND m.occurred_at < $3::date
           GROUP BY p.id,p.part_code,p.name,p.unit
           ORDER BY ABS(SUM(m.quantity)) DESC,p.name LIMIT 10`,
          parameters,
        )).rows.map((row) => ({ ...row, quantity: numeric(row.quantity), value: numeric(row.value) }));

        const lowStock = (await client.query(
          `SELECT p.id AS "productId",p.part_code AS "partCode",p.name,p.unit,
             p.minimum_stock::text AS "minimumStock",COALESCE(SUM(b.quantity),0)::text AS quantity,
             COALESCE(SUM(b.reserved_quantity),0)::text AS "reservedQuantity",
             COALESCE(SUM(b.quantity-b.reserved_quantity),0)::text AS "availableQuantity",
             COALESCE(SUM(b.quantity*p.hpp),0)::text AS value
           FROM app.products p
           JOIN app.inventory_balances b ON b.product_id=p.id
           WHERE p.status='active' AND ($1::uuid IS NULL OR b.warehouse_id=$1)
           GROUP BY p.id,p.part_code,p.name,p.unit,p.minimum_stock
           HAVING COALESCE(SUM(b.quantity),0)<=p.minimum_stock
           ORDER BY COALESCE(SUM(b.quantity),0)-p.minimum_stock,p.name LIMIT 50`,
          [range.warehouseId],
        )).rows.map((row) => ({
          ...row, minimumStock: numeric(row.minimumStock), quantity: numeric(row.quantity),
          reservedQuantity: numeric(row.reservedQuantity), availableQuantity: numeric(row.availableQuantity), value: numeric(row.value),
        }));

        return {
          range: { from: range.from, to: range.to },
          summary: {
            totalItems: numeric(summaryRow.totalItems), inventoryValue: showCost ? numeric(summaryRow.inventoryValue) : null,
            incomingValue: showCost ? numeric(summaryRow.incomingValue) : null,
            outgoingValue: showCost ? numeric(summaryRow.outgoingValue) : null,
            incomingTransactions: numeric(summaryRow.incomingTransactions), outgoingTransactions: numeric(summaryRow.outgoingTransactions),
            lowStockCount: numeric(summaryRow.lowStockCount),
          },
          stockOverview: stockOverview.map((item) => ({ ...item, value: showCost ? item.value : null })),
          movementTrend: movementTrend.map((item) => ({
            ...item, incomingValue: showCost ? item.incomingValue : null, outgoingValue: showCost ? item.outgoingValue : null,
          })),
          topUsed: topUsed.map((item) => ({ ...item, value: showCost ? item.value : null })),
          lowStock: lowStock.map((item) => ({ ...item, value: showCost ? item.value : null })),
        };
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
