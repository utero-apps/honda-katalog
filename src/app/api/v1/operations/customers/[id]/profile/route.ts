import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, fail, ok } from "@/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const id = z.uuid().parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const customer = (await client.query(
        "SELECT id,name,phone,email,address,notes,is_active AS \"isActive\",communication_consent AS \"communicationConsent\",preferred_channel AS \"preferredChannel\",created_at AS \"createdAt\" FROM app.customers WHERE id=$1 AND merged_into_id IS NULL",
        [id],
      )).rows[0];
      if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan");

      const vehicles = await client.query(`SELECT v.id,v.plate_number AS "plateNumber",v.vehicle_model_id AS "vehicleModelId",v.year,v.vin,v.engine_number AS "engineNumber",v.image_url AS "imageUrl",v.odometer::text,m.name AS model
        FROM app.customer_vehicles v LEFT JOIN app.vehicle_models m ON m.id=v.vehicle_model_id
        WHERE v.customer_id=$1 ORDER BY v.updated_at DESC`, [id]);
      const orders = await client.query(`SELECT s.id,s.order_number AS "orderNumber",s.status,s.complaint,s.odometer::text,s.opened_at AS "openedAt",s.completed_at AS "completedAt",
        v.plate_number AS "plateNumber",m.display_name AS "mechanicName",i.total::text,
        (SELECT string_agg(j.name,', ' ORDER BY j.created_at,j.id) FROM app.service_order_jobs j WHERE j.service_order_id=s.id) AS "repairSummary"
        FROM app.service_orders s JOIN app.customer_vehicles v ON v.id=s.vehicle_id
        LEFT JOIN app.users m ON m.id=s.assigned_mechanic_id
        LEFT JOIN app.customer_invoices i ON i.service_order_id=s.id AND i.status<>'reversed'
        WHERE s.customer_id=$1 ORDER BY s.created_at DESC`, [id]);
      const repeatRepairs = await client.query<{ count: string }>(`SELECT count(*)::text FROM (
        SELECT completed_at,lag(completed_at) OVER (PARTITION BY vehicle_id ORDER BY completed_at) AS previous
        FROM app.service_orders WHERE customer_id=$1 AND completed_at IS NOT NULL
      ) visits WHERE completed_at-previous <= interval '30 days'`, [id]);
      const followUps = await client.query("SELECT id,due_at AS \"dueAt\",channel,status,notes FROM app.customer_follow_ups WHERE customer_id=$1 ORDER BY due_at DESC", [id]);
      const reminders = await client.query<{ odometerDue: string | null }>(`SELECT r.id,r.vehicle_id AS "vehicleId",v.plate_number AS "plateNumber",r.due_at AS "dueAt",r.odometer_due::text AS "odometerDue",r.status
        FROM app.service_reminders r JOIN app.customer_vehicles v ON v.id=r.vehicle_id
        WHERE r.customer_id=$1 ORDER BY r.due_at ASC`, [id]);
      const spareParts = await client.query<{ quantity: string; unitPrice: string }>(`SELECT sp.id,sp.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",s.opened_at AS "openedAt",p.id AS "productId",p.part_code AS "partCode",p.name,
        sp.quantity::text AS quantity,sp.unit_price::text AS "unitPrice",sp.consumed_at AS "consumedAt"
        FROM app.service_order_parts sp JOIN app.service_orders s ON s.id=sp.service_order_id JOIN app.products p ON p.id=sp.product_id
        WHERE s.customer_id=$1 ORDER BY s.opened_at DESC,sp.created_at DESC`, [id]);
      const invoices = await client.query<{ total: string; paidAmount: string; outstandingAmount: string }>(`SELECT i.id,i.invoice_number AS "invoiceNumber",i.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",i.status,i.total::text AS total,i.issued_at AS "issuedAt",i.due_at AS "dueAt",
        COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL),0)::text AS "paidAmount",
        GREATEST(i.total-COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL),0),0)::text AS "outstandingAmount"
        FROM app.customer_invoices i LEFT JOIN app.service_orders s ON s.id=i.service_order_id LEFT JOIN app.payments p ON p.customer_invoice_id=i.id
        WHERE i.customer_id=$1 GROUP BY i.id,s.order_number ORDER BY i.issued_at DESC NULLS LAST,i.created_at DESC`, [id]);
      const payments = await client.query<{ amount: string }>(`SELECT p.id,p.payment_number AS "paymentNumber",p.customer_invoice_id AS "customerInvoiceId",i.invoice_number AS "invoiceNumber",p.amount::text AS amount,p.method,p.reference,p.paid_at AS "paidAt",
        CASE WHEN p.reversed_at IS NULL THEN 'posted' ELSE 'reversed' END AS status
        FROM app.payments p JOIN app.customer_invoices i ON i.id=p.customer_invoice_id WHERE i.customer_id=$1 ORDER BY p.paid_at DESC`, [id]);
      const posTransactions = await client.query<{ total: string }>(`SELECT id,sale_number AS "saleNumber",status,total::text AS total,completed_at AS "completedAt",voided_at AS "voidedAt"
        FROM app.pos_sales WHERE customer_id=$1 ORDER BY completed_at DESC`, [id]);
      const auditHistory = await client.query(`SELECT a.id,a.action,u.display_name AS "actorName",a.created_at AS "createdAt"
        FROM app.audit_events a LEFT JOIN app.users u ON u.id=a.actor_id
        WHERE (a.entity_type='customer' AND a.entity_id=$1)
          OR (a.entity_type='customer_vehicle' AND a.entity_id IN
            (SELECT id FROM app.customer_vehicles WHERE customer_id=$1))
        ORDER BY a.created_at DESC LIMIT 50`, [id]);

      return {
        customer,
        vehicles: vehicles.rows.map((row) => ({ ...row, odometer: Number(row.odometer) })),
        orders: orders.rows.map((row) => ({ ...row, odometer: row.odometer === null ? null : Number(row.odometer), total: row.total === null ? null : Number(row.total) })),
        repeatRepairCount: Number(repeatRepairs.rows[0]?.count ?? 0),
        followUps: followUps.rows,
        reminders: reminders.rows.map((row) => ({ ...row, odometerDue: row.odometerDue === null ? null : Number(row.odometerDue) })),
        spareParts: spareParts.rows.map((row) => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice) })),
        invoices: invoices.rows.map((row) => ({ ...row, total: Number(row.total), paidAmount: Number(row.paidAmount), outstandingAmount: Number(row.outstandingAmount) })),
        payments: payments.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
        posTransactions: posTransactions.rows.map((row) => ({ ...row, total: Number(row.total) })),
        auditHistory: auditHistory.rows,
      };
    });
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
