import type { PoolClient } from "pg";
import { ApiError } from "@/server/http";

export type ServiceType = "general" | "monthly" | "mileage" | "routine";

const reminderPolicy: Record<ServiceType, { days: number; kilometers: number }> = {
  general: { days: 90, kilometers: 2_000 },
  monthly: { days: 30, kilometers: 1_000 },
  mileage: { days: 90, kilometers: 2_000 },
  routine: { days: 180, kilometers: 4_000 },
};

export function getServiceLifecyclePolicy(serviceType: ServiceType) {
  return { followUpDays: 3, ...reminderPolicy[serviceType] };
}

export async function createHandoverLifecycle(client: PoolClient, serviceOrderId: string) {
  const order = (await client.query<{
    customerId: string;
    vehicleId: string;
    serviceType: ServiceType;
    odometer: string | null;
    preferredChannel: "phone" | "whatsapp" | "email";
  }>(`SELECT so.customer_id AS "customerId",so.vehicle_id AS "vehicleId",so.service_type::text AS "serviceType",so.odometer::text,
        c.preferred_channel AS "preferredChannel"
      FROM app.service_orders so JOIN app.customers c ON c.id=so.customer_id WHERE so.id=$1`, [serviceOrderId])).rows[0];
  if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");

  const policy = getServiceLifecyclePolicy(order.serviceType);
  const followUp = (await client.query(
    `INSERT INTO app.customer_follow_ups(customer_id,service_order_id,due_at,channel,status,notes,automation_key)
     VALUES($1,$2,now()+($3*interval '1 day'),$4,'pending','Tindak lanjut kepuasan setelah serah terima',$5)
     ON CONFLICT(automation_key) DO NOTHING
     RETURNING id,due_at AS "dueAt",status`,
    [order.customerId, serviceOrderId, policy.followUpDays, order.preferredChannel, `handover-follow-up:${serviceOrderId}`],
  )).rows[0] ?? (await client.query('SELECT id,due_at AS "dueAt",status FROM app.customer_follow_ups WHERE automation_key=$1', [`handover-follow-up:${serviceOrderId}`])).rows[0];
  const odometer = order.odometer === null ? null : Number(order.odometer);
  const reminder = (await client.query(
    `INSERT INTO app.service_reminders(vehicle_id,customer_id,due_at,odometer_due,status,automation_key)
     VALUES($1,$2,now()+($3*interval '1 day'),$4,'pending',$5)
     ON CONFLICT(automation_key) DO NOTHING
     RETURNING id,due_at AS "dueAt",odometer_due::text AS "odometerDue",status`,
    [order.vehicleId, order.customerId, policy.days, odometer === null ? null : odometer + policy.kilometers, `handover-reminder:${serviceOrderId}`],
  )).rows[0] ?? (await client.query('SELECT id,due_at AS "dueAt",odometer_due::text AS "odometerDue",status FROM app.service_reminders WHERE automation_key=$1', [`handover-reminder:${serviceOrderId}`])).rows[0];
  return { followUp, reminder };
}
