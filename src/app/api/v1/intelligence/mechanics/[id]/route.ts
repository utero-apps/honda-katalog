import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

const paramsSchema = z.object({ id: z.uuid() });

const numeric = (value: unknown) => Number(value ?? 0);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const requestId = crypto.randomUUID();
    const { id } = paramsSchema.parse(await context.params);
    const actor = await requirePermission(request, requestId, "reports.read");

    const data = await withActorTransaction(
      { userId: actor.id, role: actor.role, requestId },
      async (client) => {
        const profile = (
          await client.query<{
            id: string;
            name: string;
            email: string;
            employeeCode: string;
            isActive: boolean;
          }>(
            `SELECT u.id,u.display_name AS name,u.email,m.employee_code AS "employeeCode",m.is_active AS "isActive"
             FROM app.mechanics m
             JOIN app.users u ON u.id=m.user_id
             WHERE m.user_id=$1 AND m.is_active=true AND u.is_active=true`,
            [id],
          )
        ).rows[0];
        if (!profile) {
          throw new ApiError(404, "MECHANIC_NOT_FOUND", "Mekanik tidak ditemukan");
        }

        const performanceResult = await client.query<{
              totalOrders: number;
              completedOrders: number;
              activeOrders: number;
              averageHours: string;
              fees: string;
              jobsCompleted: number;
              partsConsumed: string;
              qualityPassed: number;
              qualityFailed: number;
            }>(
              `SELECT
                count(*)::int AS "totalOrders",
                count(*) FILTER (WHERE s.status='completed')::int AS "completedOrders",
                count(*) FILTER (WHERE s.status IN ('assigned','in_progress','quality_check'))::int AS "activeOrders",
                coalesce(avg(extract(epoch FROM (s.completed_at-s.opened_at))/3600)
                  FILTER (WHERE s.completed_at IS NOT NULL AND s.opened_at IS NOT NULL),0)::numeric(12,2)::text AS "averageHours",
                coalesce((SELECT sum(f.fee_amount) FROM app.mechanic_fees f WHERE f.mechanic_id=$1),0)::text AS fees,
                coalesce((SELECT count(*) FROM app.service_order_jobs j WHERE j.mechanic_id=$1 AND j.status='completed'),0)::int AS "jobsCompleted",
                coalesce((SELECT sum(p.quantity) FROM app.service_order_parts p JOIN app.service_orders so ON so.id=p.service_order_id WHERE so.assigned_mechanic_id=$1 AND p.consumed_at IS NOT NULL),0)::text AS "partsConsumed",
                coalesce((SELECT count(*) FROM app.quality_checks q JOIN app.service_orders so ON so.id=q.service_order_id WHERE so.assigned_mechanic_id=$1 AND q.passed),0)::int AS "qualityPassed",
                coalesce((SELECT count(*) FROM app.quality_checks q JOIN app.service_orders so ON so.id=q.service_order_id WHERE so.assigned_mechanic_id=$1 AND NOT q.passed),0)::int AS "qualityFailed"
               FROM app.service_orders s WHERE s.assigned_mechanic_id=$1`,
              [id],
            );
        const ordersResult = await client.query(
              `SELECT s.id,s.order_number AS "orderNumber",s.status,c.name AS "customerName",v.plate_number AS "plateNumber",s.opened_at AS "openedAt",s.completed_at AS "completedAt",
                (SELECT count(*)::int FROM app.service_order_jobs j WHERE j.service_order_id=s.id) AS "totalJobs",
                (SELECT count(*)::int FROM app.service_order_jobs j WHERE j.service_order_id=s.id AND j.status='completed') AS "completedJobs",
                (SELECT coalesce(sum(p.quantity),0)::text FROM app.service_order_parts p WHERE p.service_order_id=s.id AND p.consumed_at IS NOT NULL) AS "consumedParts",
                (SELECT q.passed FROM app.quality_checks q WHERE q.service_order_id=s.id) AS "qualityPassed"
               FROM app.service_orders s JOIN app.customers c ON c.id=s.customer_id JOIN app.customer_vehicles v ON v.id=s.vehicle_id
               WHERE s.assigned_mechanic_id=$1 ORDER BY s.opened_at DESC NULLS LAST,s.created_at DESC`,
              [id],
            );
        const jobsResult = await client.query(
              `SELECT j.id,j.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",j.name,j.status,j.price::text,j.created_at AS "createdAt"
               FROM app.service_order_jobs j JOIN app.service_orders s ON s.id=j.service_order_id
               WHERE j.mechanic_id=$1 OR s.assigned_mechanic_id=$1 ORDER BY j.created_at DESC`,
              [id],
            );
        const partsResult = await client.query(
              `SELECT p.id,p.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",product.part_code AS "partCode",product.name,p.quantity::text,product.unit,p.consumed_at AS "consumedAt"
               FROM app.service_order_parts p JOIN app.service_orders s ON s.id=p.service_order_id JOIN app.products product ON product.id=p.product_id
               WHERE s.assigned_mechanic_id=$1 ORDER BY p.consumed_at DESC NULLS LAST,p.created_at DESC`,
              [id],
            );
        const qualityResult = await client.query(
              `SELECT q.id,q.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",q.passed,q.notes,q.checked_at AS "checkedAt"
               FROM app.quality_checks q JOIN app.service_orders s ON s.id=q.service_order_id
               WHERE s.assigned_mechanic_id=$1 ORDER BY q.checked_at DESC`,
              [id],
            );
        const feesResult = await client.query(
              `SELECT f.id,f.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",f.fee_amount::text AS amount,f.created_at AS "createdAt"
               FROM app.mechanic_fees f JOIN app.service_orders s ON s.id=f.service_order_id
               WHERE f.mechanic_id=$1 ORDER BY f.created_at DESC`,
              [id],
            );

        const performance = performanceResult.rows[0];
        return {
          profile,
          performance: {
            totalOrders: numeric(performance.totalOrders),
            completedOrders: numeric(performance.completedOrders),
            activeOrders: numeric(performance.activeOrders),
            completionRate: performance.totalOrders
              ? Number(((numeric(performance.completedOrders) / numeric(performance.totalOrders)) * 100).toFixed(1))
              : 0,
            averageHours: numeric(performance.averageHours),
            fees: numeric(performance.fees),
            jobsCompleted: numeric(performance.jobsCompleted),
            partsConsumed: numeric(performance.partsConsumed),
            qualityPassed: numeric(performance.qualityPassed),
            qualityFailed: numeric(performance.qualityFailed),
          },
          orders: ordersResult.rows.map((item) => ({ ...item, consumedParts: numeric(item.consumedParts) })),
          jobs: jobsResult.rows.map((item) => ({ ...item, price: numeric(item.price) })),
          parts: partsResult.rows.map((item) => ({ ...item, quantity: numeric(item.quantity) })),
          qualityChecks: qualityResult.rows,
          fees: feesResult.rows.map((item) => ({ ...item, amount: numeric(item.amount) })),
        };
      },
    );

    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
