import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/http";
import type { CreateCustomerInput, CreateOrderInput, CreateVehicleInput, RecommendationInput } from "@/features/service-reception/schemas";
import { normalizeCustomerEmail, normalizeCustomerPhone } from "@/features/customer-management/schemas";

type Actor = { id: string; requestId: string };
type Recommendation = { code: string; title: string; reason: string; priority: "normal" | "recommended" | "high" };

const canonicalPlate = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
const hashRequest = (input: CreateOrderInput) => crypto.createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
const isUniqueViolation = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");

export async function searchReceptionCustomers(client: PoolClient, query: string, limit: number) {
  const term = `%${query}%`;
  const canonical = `%${canonicalPlate(query)}%`;
  const result = await client.query(
    `SELECT c.id,c.name,c.phone,c.email,c.address,c.is_active AS "isActive",
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',v.id,'plateNumber',v.plate_number,'model',m.name,'year',v.year,'odometer',v.odometer)) FILTER (WHERE v.id IS NOT NULL),'[]'::jsonb) AS vehicles
     FROM app.customers c
     LEFT JOIN app.customer_vehicles v ON v.customer_id=c.id
     LEFT JOIN app.vehicle_models m ON m.id=v.vehicle_model_id
     WHERE c.is_active=true AND (c.name ILIKE $1 OR c.phone ILIKE $1 OR v.canonical_plate LIKE $2)
     GROUP BY c.id ORDER BY c.updated_at DESC LIMIT $3`,
    [term, canonical, limit],
  );
  return result.rows;
}

export async function getCustomerContext(client: PoolClient, customerId: string) {
  const customer = (await client.query("SELECT id,name,phone,email,address,notes,is_active AS \"isActive\" FROM app.customers WHERE id=$1", [customerId])).rows[0];
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan");
  const vehicles = await client.query(
    `SELECT v.id,v.plate_number AS "plateNumber",v.vehicle_model_id AS "vehicleModelId",m.name AS model,v.year,v.vin,v.engine_number AS "engineNumber",v.odometer::text,
      (SELECT max(l.recorded_at) FROM app.vehicle_odometer_logs l WHERE l.vehicle_id=v.id) AS "lastOdometerAt"
     FROM app.customer_vehicles v LEFT JOIN app.vehicle_models m ON m.id=v.vehicle_model_id
     WHERE v.customer_id=$1 ORDER BY v.updated_at DESC`,
    [customerId],
  );
  return { customer, vehicles: vehicles.rows.map((vehicle) => ({ ...vehicle, odometer: Number(vehicle.odometer) })) };
}

export async function createReceptionCustomer(client: PoolClient, actor: Actor, input: CreateCustomerInput) {
  if (input.phone) {
    const existing = (await client.query("SELECT id FROM app.customers WHERE phone=$1", [input.phone])).rows[0];
    if (existing) throw new ApiError(409, "CUSTOMER_PHONE_EXISTS", "Nomor telepon sudah terdaftar");
  }
  let customer;
  try {
    customer = (await client.query(
      `INSERT INTO app.customers(name,phone,email,address,notes,normalized_phone,normalized_email,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,name,phone,email,address,notes,is_active AS "isActive"`,
      [input.name, input.phone ?? null, input.email ?? null, input.address ?? null, input.notes ?? null, normalizeCustomerPhone(input.phone), normalizeCustomerEmail(input.email), actor.id],
    )).rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "CUSTOMER_CONTACT_EXISTS", "Nomor telepon atau email sudah terdaftar");
    throw error;
  }
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_reception.customer.create", entityType: "customer", entityId: customer.id, after: customer });
  return customer;
}

export async function createReceptionVehicle(client: PoolClient, actor: Actor, input: CreateVehicleInput) {
  const plateNumber = input.plateNumber.toUpperCase();
  const customer = await client.query("SELECT 1 FROM app.customers WHERE id=$1 AND is_active=true", [input.customerId]);
  if (!customer.rowCount) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan aktif tidak ditemukan");
  const duplicate = await client.query("SELECT 1 FROM app.customer_vehicles WHERE canonical_plate=$1", [canonicalPlate(plateNumber)]);
  if (duplicate.rowCount) throw new ApiError(409, "VEHICLE_PLATE_EXISTS", "Nomor polisi sudah terdaftar");
  if (input.vehicleModelId) {
    const model = await client.query("SELECT 1 FROM app.vehicle_models WHERE id=$1 AND is_active=true", [input.vehicleModelId]);
    if (!model.rowCount) throw new ApiError(422, "VEHICLE_MODEL_INVALID", "Model kendaraan tidak aktif atau tidak ditemukan");
  }
  let vehicle;
  try {
    vehicle = (await client.query(
      `INSERT INTO app.customer_vehicles(customer_id,vehicle_model_id,plate_number,year,vin,engine_number,odometer,image_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,customer_id AS "customerId",vehicle_model_id AS "vehicleModelId",plate_number AS "plateNumber",year,vin,engine_number AS "engineNumber",odometer::text,image_url AS "imageUrl"`,
      [input.customerId, input.vehicleModelId ?? null, plateNumber, input.year ?? null, input.vin ?? null, input.engineNumber ?? null, input.odometer, input.imageUrl ?? null],
    )).rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "VEHICLE_PLATE_EXISTS", "Nomor polisi sudah terdaftar");
    throw error;
  }
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_reception.vehicle.create", entityType: "customer_vehicle", entityId: vehicle.id, after: vehicle });
  return { ...vehicle, odometer: Number(vehicle.odometer) };
}

export async function getRecommendations(client: PoolClient, input: RecommendationInput): Promise<Recommendation[]> {
  const vehicle = (await client.query<{ vehicle_model_id: string | null; model_name: string | null; odometer: string }>(
    `SELECT v.vehicle_model_id,m.name AS model_name,v.odometer::text FROM app.customer_vehicles v
     LEFT JOIN app.vehicle_models m ON m.id=v.vehicle_model_id WHERE v.id=$1`,
    [input.vehicleId],
  )).rows[0];
  if (!vehicle) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Kendaraan tidak ditemukan");
  const history = await client.query<{ service_type: string; odometer: string | null; opened_at: string | null }>(
    `SELECT service_type,odometer::text,opened_at::text FROM app.service_orders
     WHERE vehicle_id=$1 AND status<>'cancelled' ORDER BY opened_at DESC NULLS LAST,created_at DESC LIMIT 12`,
    [input.vehicleId],
  );
  const recommendations: Recommendation[] = [];
  const add = (code: string, title: string, reason: string, priority: Recommendation["priority"] = "recommended") => {
    if (!recommendations.some((item) => item.code === code)) recommendations.push({ code, title, reason, priority });
  };
  if (input.serviceType === "general") add("GENERAL_INSPECTION", "Pemeriksaan umum", "Keluhan umum memerlukan diagnosis menyeluruh.");
  if (input.serviceType === "monthly") {
    add("ENGINE_OIL", "Periksa oli mesin", "Paket servis bulanan.");
    add("BRAKE_TIRE", "Periksa rem dan ban", "Komponen keselamatan pada inspeksi berkala.");
  }
  if (input.serviceType === "mileage") {
    add("MILEAGE_PACKAGE", "Paket servis berdasarkan kilometer", `Odometer saat ini ${input.odometer.toLocaleString("id-ID")} km.`, "high");
    if (input.odometer >= 8_000) add("AIR_FILTER", "Periksa filter udara", "Interval kilometer sudah mencapai pemeriksaan filter.");
    if (input.odometer >= 16_000) add("CVT_DRIVE", "Periksa CVT atau rantai penggerak", "Interval kilometer memerlukan pemeriksaan sistem penggerak.", "high");
  }
  if (input.serviceType === "routine") {
    add("ROUTINE_TUNEUP", "Tune-up rutin", "Pemeliharaan rutin kendaraan.");
    add("FLUID_LIGHT", "Periksa fluida dan lampu", "Bagian dari pemeriksaan rutin.");
  }
  const last = history.rows[0];
  if (!last) add("FIRST_HISTORY", "Buat baseline kondisi kendaraan", "Belum ada riwayat servis kendaraan ini.");
  else if (last.odometer && input.odometer - Number(last.odometer) >= 4_000) add("DISTANCE_GAP", "Inspeksi interval kilometer", `Jarak sejak servis terakhir sekitar ${Math.round(input.odometer - Number(last.odometer)).toLocaleString("id-ID")} km.`, "high");
  if (vehicle.model_name) add("MODEL_CHECK", `Checklist ${vehicle.model_name}`, "Gunakan titik pemeriksaan sesuai model kendaraan.", "normal");
  return recommendations;
}

export async function createReceptionOrder(client: PoolClient, actor: Actor, input: CreateOrderInput) {
  const requestHash = hashRequest(input);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`service-reception:${actor.id}:${input.idempotencyKey}`]);
  const existing = (await client.query<{ service_order_id: string; request_hash: string }>("SELECT service_order_id,request_hash FROM app.service_receptions WHERE received_by=$1 AND idempotency_key=$2", [actor.id, input.idempotencyKey])).rows[0];
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Kunci idempotensi sudah digunakan untuk penerimaan berbeda");
    return getReceptionOrder(client, existing.service_order_id);
  }

  let customerId = input.customerId;
  if (input.customer) customerId = (await createReceptionCustomer(client, actor, input.customer)).id;
  if (!customerId) throw new ApiError(422, "CUSTOMER_REQUIRED", "Pelanggan wajib dipilih");
  const activeCustomer = await client.query("SELECT 1 FROM app.customers WHERE id=$1 AND is_active=true", [customerId]);
  if (!activeCustomer.rowCount) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan aktif tidak ditemukan");

  let vehicleId = input.vehicleId;
  if (input.vehicle) vehicleId = (await createReceptionVehicle(client, actor, { ...input.vehicle, customerId, odometer: input.odometer })).id;
  if (!vehicleId) throw new ApiError(422, "VEHICLE_REQUIRED", "Kendaraan wajib dipilih");

  const vehicle = (await client.query<{ customer_id: string; odometer: string }>(
    "SELECT customer_id,odometer::text FROM app.customer_vehicles WHERE id=$1 FOR UPDATE",
    [vehicleId],
  )).rows[0];
  if (!vehicle) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Kendaraan tidak ditemukan");
  if (vehicle.customer_id !== customerId) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Kendaraan tidak ditemukan");
  const previousOdometer = Number(vehicle.odometer);
  const isCorrection = input.odometer < previousOdometer;
  if (isCorrection && !input.odometerCorrectionReason) {
    throw new ApiError(422, "ODOMETER_CORRECTION_REASON_REQUIRED", `Koreksi odometer dari ${previousOdometer} memerlukan alasan minimal 3 karakter`);
  }

  const recommendations = await getRecommendations(client, { vehicleId, serviceType: input.serviceType, odometer: input.odometer });
  const orderNumber = (await client.query<{ order_number: string }>(
    `SELECT 'SRV-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(nextval('app.service_reception_number_seq')::text,8,'0') AS order_number`,
  )).rows[0].order_number;
  const order = (await client.query<{ id: string }>(
    `INSERT INTO app.service_orders(order_number,customer_id,vehicle_id,service_type,status,complaint,odometer,opened_at,created_by,updated_by)
     VALUES($1,$2,$3,$4,'open',$5,$6,now(),$7,$7) RETURNING id`,
    [orderNumber, customerId, vehicleId, input.serviceType, input.complaint, input.odometer, actor.id],
  )).rows[0];
  await client.query(
    `INSERT INTO app.service_receptions(service_order_id,service_type,fuel_level,physical_condition,belongings,notes,recommendations,received_by,idempotency_key,request_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [order.id, input.serviceType, input.checklist.fuelLevel ?? null, input.checklist.physicalCondition ?? null, input.checklist.belongings, input.checklist.notes ?? null, JSON.stringify(recommendations), actor.id, input.idempotencyKey, requestHash],
  );
  await client.query("INSERT INTO app.vehicle_odometer_logs(vehicle_id,service_order_id,odometer,recorded_by,notes,odometer_correction_reason) VALUES($1,$2,$3,$4,$5,$6)", [vehicleId, order.id, input.odometer, actor.id, "Penerimaan servis", isCorrection ? input.odometerCorrectionReason : null]);
  await client.query("UPDATE app.customer_vehicles SET odometer=$1,updated_at=now() WHERE id=$2", [input.odometer, vehicleId]);
  await client.query("INSERT INTO app.service_order_status_history(service_order_id,to_status,reason,actor_id) VALUES($1,'open','Penerimaan servis',$2)", [order.id, actor.id]);
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_reception.order.create", entityType: "service_order", entityId: order.id, after: { orderNumber, customerId, vehicleId, serviceType: input.serviceType, odometer: input.odometer, previousOdometer, odometerCorrectionReason: isCorrection ? input.odometerCorrectionReason : null } });
  if (isCorrection) await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_reception.odometer.correct", entityType: "customer_vehicle", entityId: vehicleId, before: { odometer: previousOdometer }, after: { odometer: input.odometer, reason: input.odometerCorrectionReason, serviceOrderId: order.id } });
  return getReceptionOrder(client, order.id);
}

export async function getReceptionOrder(client: PoolClient, id: string) {
  const order = (await client.query(
    `SELECT s.id,s.order_number AS "orderNumber",s.status,s.service_type AS "serviceType",s.complaint,s.odometer::text,s.opened_at AS "openedAt",
      c.id AS "customerId",c.name AS "customerName",c.phone AS "customerPhone",v.id AS "vehicleId",v.plate_number AS "plateNumber",v.image_url AS "imageUrl",m.name AS model,
      r.fuel_level::text AS "fuelLevel",r.physical_condition AS "physicalCondition",r.belongings,r.notes,r.recommendations,r.received_at AS "receivedAt"
     FROM app.service_orders s JOIN app.customers c ON c.id=s.customer_id JOIN app.customer_vehicles v ON v.id=s.vehicle_id
     LEFT JOIN app.vehicle_models m ON m.id=v.vehicle_model_id JOIN app.service_receptions r ON r.service_order_id=s.id WHERE s.id=$1`,
    [id],
  )).rows[0];
  if (!order) throw new ApiError(404, "RECEPTION_ORDER_NOT_FOUND", "Penerimaan servis tidak ditemukan");
  return { ...order, odometer: Number(order.odometer), fuelLevel: order.fuelLevel === null ? null : Number(order.fuelLevel) };
}
