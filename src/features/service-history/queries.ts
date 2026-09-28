import type { PoolClient } from "pg";
import { ApiError } from "@/server/http";

export type VehicleServiceHistoryItem = {
  id: string;
  orderNumber: string;
  status: string;
  openedAt: string;
  completedAt: string;
  odometer: number | null;
  work: string[];
  total: number;
  mechanic: { id: string; name: string } | null;
};

export type VehicleServiceHistory = {
  vehicle: {
    id: string;
    plateNumber: string;
    model: string | null;
    customerId: string;
    customerName: string;
  };
  services: VehicleServiceHistoryItem[];
};

type HistoryRow = Omit<VehicleServiceHistoryItem, "odometer" | "work" | "total" | "mechanic"> & {
  odometer: string | null;
  work: string[] | null;
  total: string;
  mechanicId: string | null;
  mechanicName: string | null;
};

export async function getVehicleServiceHistory(client: PoolClient, vehicleId: string): Promise<VehicleServiceHistory> {
  const vehicle = (await client.query<VehicleServiceHistory["vehicle"]>(
    `SELECT v.id,v.plate_number AS "plateNumber",vm.name AS model,
       c.id AS "customerId",c.name AS "customerName"
     FROM app.customer_vehicles v
     JOIN app.customers c ON c.id=v.customer_id
     LEFT JOIN app.vehicle_models vm ON vm.id=v.vehicle_model_id
     WHERE v.id=$1`,
    [vehicleId],
  )).rows[0];

  if (!vehicle) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Kendaraan tidak ditemukan");

  const services = (await client.query<HistoryRow>(
    `SELECT s.id,s.order_number AS "orderNumber",s.status,s.opened_at AS "openedAt",
       s.completed_at AS "completedAt",COALESCE(ol.odometer,s.odometer)::text AS odometer,
       COALESCE(j.work,'{}'::text[]) AS work,
       COALESCE(i.total,j.labor + p.parts,0)::text AS total,
       u.id AS "mechanicId",u.display_name AS "mechanicName"
     FROM app.service_orders s
     LEFT JOIN app.vehicle_odometer_logs ol ON ol.service_order_id=s.id
     LEFT JOIN app.users u ON u.id=s.assigned_mechanic_id
     LEFT JOIN app.customer_invoices i ON i.service_order_id=s.id AND i.status<>'reversed'
     LEFT JOIN LATERAL (
       SELECT COALESCE(array_agg(sj.name ORDER BY sj.created_at,sj.id),'{}'::text[]) AS work,
         COALESCE(sum(sj.price),0) AS labor
       FROM app.service_order_jobs sj WHERE sj.service_order_id=s.id
     ) j ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(sp.quantity*sp.unit_price),0) AS parts
       FROM app.service_order_parts sp WHERE sp.service_order_id=s.id
     ) p ON true
     WHERE s.vehicle_id=$1 AND s.completed_at IS NOT NULL
     ORDER BY s.completed_at DESC,s.id DESC
     LIMIT 100`,
    [vehicleId],
  )).rows;

  return {
    vehicle,
    services: services.map((service) => ({
      id: service.id,
      orderNumber: service.orderNumber,
      status: service.status,
      openedAt: service.openedAt,
      completedAt: service.completedAt,
      odometer: service.odometer === null ? null : Number(service.odometer),
      work: service.work ?? [],
      total: Number(service.total),
      mechanic: service.mechanicId && service.mechanicName
        ? { id: service.mechanicId, name: service.mechanicName }
        : null,
    })),
  };
}
