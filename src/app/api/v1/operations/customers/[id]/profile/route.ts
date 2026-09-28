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
        "SELECT id,name,phone,email,address,notes,created_at AS \"createdAt\" FROM app.customers WHERE id=$1",
        [id],
      )).rows[0];
      if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan");

      const [vehicles, orders, followUps, reminders, spareParts, invoices, payments, posTransactions] = await Promise.all([
        client.query("SELECT id,plate_number AS \"plateNumber\",year,odometer::text FROM app.customer_vehicles WHERE customer_id=$1 ORDER BY updated_at DESC", [id]),
        client.query("SELECT id,order_number AS \"orderNumber\",status,complaint,opened_at AS \"openedAt\",completed_at AS \"completedAt\" FROM app.service_orders WHERE customer_id=$1 ORDER BY created_at DESC", [id]),
        client.query("SELECT id,due_at AS \"dueAt\",channel,status,notes FROM app.customer_follow_ups WHERE customer_id=$1 ORDER BY due_at DESC", [id]),
        client.query<{ odometerDue: string | null }>(`SELECT r.id,r.vehicle_id AS "vehicleId",v.plate_number AS "plateNumber",r.due_at AS "dueAt",r.odometer_due::text AS "odometerDue",r.status
          FROM app.service_reminders r JOIN app.customer_vehicles v ON v.id=r.vehicle_id
          WHERE r.customer_id=$1 ORDER BY r.due_at ASC`, [id]),
        client.query<{ quantity: string; unitPrice: string }>(`SELECT sp.id,sp.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",s.opened_at AS "openedAt",p.id AS "productId",p.part_code AS "partCode",p.name,
          sp.quantity::text AS quantity,sp.unit_price::text AS "unitPrice",sp.consumed_at AS "consumedAt"
          FROM app.service_order_parts sp JOIN app.service_orders s ON s.id=sp.service_order_id JOIN app.products p ON p.id=sp.product_id
          WHERE s.customer_id=$1 ORDER BY s.opened_at DESC,sp.created_at DESC`, [id]),
        client.query<{ total: string; paidAmount: string; outstandingAmount: string }>(`SELECT i.id,i.invoice_number AS "invoiceNumber",i.service_order_id AS "serviceOrderId",s.order_number AS "orderNumber",i.status,i.total::text AS total,i.issued_at AS "issuedAt",i.due_at AS "dueAt",
          COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL),0)::text AS "paidAmount",
          GREATEST(i.total-COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL),0),0)::text AS "outstandingAmount"
          FROM app.customer_invoices i LEFT JOIN app.service_orders s ON s.id=i.service_order_id LEFT JOIN app.payments p ON p.customer_invoice_id=i.id
          WHERE i.customer_id=$1 GROUP BY i.id,s.order_number ORDER BY i.issued_at DESC NULLS LAST,i.created_at DESC`, [id]),
        client.query<{ amount: string }>(`SELECT p.id,p.payment_number AS "paymentNumber",p.customer_invoice_id AS "customerInvoiceId",i.invoice_number AS "invoiceNumber",p.amount::text AS amount,p.method,p.reference,p.paid_at AS "paidAt",
          CASE WHEN p.reversed_at IS NULL THEN 'posted' ELSE 'reversed' END AS status
          FROM app.payments p JOIN app.customer_invoices i ON i.id=p.customer_invoice_id WHERE i.customer_id=$1 ORDER BY p.paid_at DESC`, [id]),
        client.query<{ total: string }>(`SELECT id,sale_number AS "saleNumber",status,total::text AS total,completed_at AS "completedAt",voided_at AS "voidedAt"
          FROM app.pos_sales WHERE customer_id=$1 ORDER BY completed_at DESC`, [id]),
      ]);

      return {
        customer,
        vehicles: vehicles.rows.map((row) => ({ ...row, odometer: Number(row.odometer) })),
        orders: orders.rows,
        followUps: followUps.rows,
        reminders: reminders.rows.map((row) => ({ ...row, odometerDue: row.odometerDue === null ? null : Number(row.odometerDue) })),
        spareParts: spareParts.rows.map((row) => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice) })),
        invoices: invoices.rows.map((row) => ({ ...row, total: Number(row.total), paidAmount: Number(row.paidAmount), outstandingAmount: Number(row.outstandingAmount) })),
        payments: payments.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
        posTransactions: posTransactions.rows.map((row) => ({ ...row, total: Number(row.total) })),
      };
    });
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
