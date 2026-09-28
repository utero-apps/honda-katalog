import type { PoolClient } from "pg";
import { ApiError } from "@/server/http";

export type ServiceOrderReceptionSummary = {
  serviceOrder: {
    id: string;
    orderNumber: string;
    customer: { id: string; name: string };
    vehicle: { id: string; plateNumber: string; model: string | null };
  };
  reception: null | {
    id: string;
    serviceType: "general" | "monthly" | "mileage" | "routine";
    fuelLevel: number | null;
    physicalCondition: string | null;
    belongings: string[];
    notes: string | null;
    recommendations: unknown[];
    receivedBy: { id: string; name: string };
    receivedAt: string;
    odometer: number | null;
    odometerCorrectionReason: string | null;
    odometerRecordedAt: string | null;
  };
};

type SummaryRow = {
  serviceOrderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  plateNumber: string;
  model: string | null;
  receptionId: string | null;
  serviceType: ServiceOrderReceptionSummary["reception"] extends infer R ? R extends { serviceType: infer T } ? T : never : never;
  fuelLevel: string | null;
  physicalCondition: string | null;
  belongings: string[] | null;
  notes: string | null;
  recommendations: unknown[] | null;
  receivedById: string | null;
  receivedByName: string | null;
  receivedAt: string | null;
  odometer: string | null;
  odometerCorrectionReason: string | null;
  odometerRecordedAt: string | null;
};

export async function getServiceOrderReceptionSummary(client: PoolClient, serviceOrderId: string): Promise<ServiceOrderReceptionSummary> {
  const row = (await client.query<SummaryRow>(
    `SELECT s.id AS "serviceOrderId",s.order_number AS "orderNumber",
       c.id AS "customerId",c.name AS "customerName",
       v.id AS "vehicleId",v.plate_number AS "plateNumber",vm.name AS model,
       r.id AS "receptionId",r.service_type AS "serviceType",r.fuel_level::text AS "fuelLevel",
       r.physical_condition AS "physicalCondition",r.belongings,r.notes,r.recommendations,
       receiver.id AS "receivedById",receiver.display_name AS "receivedByName",r.received_at AS "receivedAt",
       ol.odometer::text AS odometer,ol.odometer_correction_reason AS "odometerCorrectionReason",
       ol.recorded_at AS "odometerRecordedAt"
     FROM app.service_orders s
     JOIN app.customers c ON c.id=s.customer_id
     JOIN app.customer_vehicles v ON v.id=s.vehicle_id
     LEFT JOIN app.vehicle_models vm ON vm.id=v.vehicle_model_id
     LEFT JOIN app.service_receptions r ON r.service_order_id=s.id
     LEFT JOIN app.users receiver ON receiver.id=r.received_by
     LEFT JOIN app.vehicle_odometer_logs ol ON ol.service_order_id=s.id
     WHERE s.id=$1`,
    [serviceOrderId],
  )).rows[0];

  if (!row) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");

  return {
    serviceOrder: {
      id: row.serviceOrderId,
      orderNumber: row.orderNumber,
      customer: { id: row.customerId, name: row.customerName },
      vehicle: { id: row.vehicleId, plateNumber: row.plateNumber, model: row.model },
    },
    reception: row.receptionId && row.serviceType && row.receivedById && row.receivedByName && row.receivedAt
      ? {
          id: row.receptionId,
          serviceType: row.serviceType,
          fuelLevel: row.fuelLevel === null ? null : Number(row.fuelLevel),
          physicalCondition: row.physicalCondition,
          belongings: row.belongings ?? [],
          notes: row.notes,
          recommendations: row.recommendations ?? [],
          receivedBy: { id: row.receivedById, name: row.receivedByName },
          receivedAt: row.receivedAt,
          odometer: row.odometer === null ? null : Number(row.odometer),
          odometerCorrectionReason: row.odometerCorrectionReason,
          odometerRecordedAt: row.odometerRecordedAt,
        }
      : null,
  };
}
