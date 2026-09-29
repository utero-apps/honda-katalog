import type { PoolClient } from "pg";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/http";
import { normalizeCustomerEmail, normalizeCustomerPhone } from "@/features/customer-management/schemas";

type Actor = { id: string; role: string; requestId: string };
type CustomerChanges = { name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; isActive?: boolean; communicationConsent?: boolean; preferredChannel?: "phone" | "whatsapp" | "email" };
type VehicleChanges = { plateNumber?: string; vehicleModelId?: string | null; year?: number | null; vin?: string | null; engineNumber?: string | null; imageUrl?: string | null };

async function ensureUniqueContact(client: PoolClient, customerId: string | null, phone: string | null, email: string | null) {
  const duplicate = (await client.query<{ id: string }>(
    `SELECT id FROM app.customers
     WHERE merged_into_id IS NULL AND ($1::uuid IS NULL OR id<>$1)
       AND (($2::text IS NOT NULL AND normalized_phone=$2) OR ($3::text IS NOT NULL AND normalized_email=$3))
     LIMIT 1`,
    [customerId, phone, email],
  )).rows[0];
  if (duplicate) throw new ApiError(409, "CUSTOMER_CONTACT_EXISTS", "Nomor telepon atau email sudah dipakai pelanggan lain");
}

export async function updateCustomer(client: PoolClient, actor: Actor, id: string, changes: CustomerChanges) {
  const before = (await client.query("SELECT * FROM app.customers WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!before) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan");
  if (before.merged_into_id) throw new ApiError(409, "CUSTOMER_MERGED", "Data pelanggan sudah digabungkan");
  const phone = changes.phone !== undefined ? normalizeCustomerPhone(changes.phone) : before.normalized_phone;
  const email = changes.email !== undefined ? normalizeCustomerEmail(changes.email) : before.normalized_email;
  if (!phone && !email) throw new ApiError(422, "CUSTOMER_CONTACT_REQUIRED", "Telepon atau email wajib diisi");
  const preferredChannel = changes.preferredChannel ?? before.preferred_channel;
  if (changes.communicationConsent === true && ((preferredChannel === "email" && !email) || (preferredChannel !== "email" && !phone))) {
    throw new ApiError(422, "CUSTOMER_CHANNEL_UNAVAILABLE", "Kanal pilihan memerlukan telepon atau email yang sesuai");
  }
  await ensureUniqueContact(client, id, phone, email);
  const after = (await client.query(
    `UPDATE app.customers SET
      name=COALESCE($1,name),phone=CASE WHEN $2 THEN $3 ELSE phone END,email=CASE WHEN $4 THEN $5 ELSE email END,
      address=CASE WHEN $6 THEN $7 ELSE address END,notes=CASE WHEN $8 THEN $9 ELSE notes END,
      is_active=COALESCE($10,is_active),normalized_phone=$11,normalized_email=$12,
      deactivated_at=CASE WHEN $10=false THEN COALESCE(deactivated_at,now()) WHEN $10=true THEN NULL ELSE deactivated_at END,
      deactivated_by=CASE WHEN $10=false THEN $13 WHEN $10=true THEN NULL ELSE deactivated_by END,
      communication_consent=COALESCE($14,communication_consent),preferred_channel=COALESCE($15,preferred_channel),
      consent_updated_at=CASE WHEN $14 IS NOT NULL THEN now() ELSE consent_updated_at END,
      consent_updated_by=CASE WHEN $14 IS NOT NULL THEN $13 ELSE consent_updated_by END,
      updated_by=$13,updated_at=now() WHERE id=$16
     RETURNING id,name,phone,email,address,notes,is_active AS "isActive",communication_consent AS "communicationConsent",preferred_channel AS "preferredChannel",updated_at AS "updatedAt"`,
    [changes.name ?? null, changes.phone !== undefined, changes.phone || null, changes.email !== undefined, changes.email || null,
      changes.address !== undefined, changes.address ?? null, changes.notes !== undefined, changes.notes ?? null,
      changes.isActive ?? null, phone, email, actor.id, changes.communicationConsent ?? null, changes.preferredChannel ?? null, id],
  )).rows[0];
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "customer.update", entityType: "customer", entityId: id, before, after });
  return after;
}

export async function updateVehicle(client: PoolClient, actor: Actor, id: string, changes: VehicleChanges) {
  const before = (await client.query("SELECT * FROM app.customer_vehicles WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!before) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Kendaraan tidak ditemukan");
  if (changes.vehicleModelId) {
    const model = await client.query("SELECT 1 FROM app.vehicle_models WHERE id=$1 AND is_active=true", [changes.vehicleModelId]);
    if (!model.rowCount) throw new ApiError(422, "VEHICLE_MODEL_INVALID", "Model kendaraan tidak aktif atau tidak ditemukan");
  }
  if (changes.plateNumber) {
    const canonical = changes.plateNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const duplicate = await client.query("SELECT 1 FROM app.customer_vehicles WHERE canonical_plate=$1 AND id<>$2", [canonical, id]);
    if (duplicate.rowCount) throw new ApiError(409, "VEHICLE_PLATE_EXISTS", "Nomor polisi sudah terdaftar");
  }
  const after = (await client.query(
    `UPDATE app.customer_vehicles SET plate_number=COALESCE($1,plate_number),
      vehicle_model_id=CASE WHEN $2 THEN $3 ELSE vehicle_model_id END,
      year=CASE WHEN $4 THEN $5 ELSE year END,vin=CASE WHEN $6 THEN $7 ELSE vin END,
      engine_number=CASE WHEN $8 THEN $9 ELSE engine_number END,image_url=CASE WHEN $10 THEN $11 ELSE image_url END,
      updated_at=now() WHERE id=$12
     RETURNING id,customer_id AS "customerId",vehicle_model_id AS "vehicleModelId",plate_number AS "plateNumber",year,vin,engine_number AS "engineNumber",odometer::text,image_url AS "imageUrl"`,
    [changes.plateNumber?.toUpperCase() ?? null, changes.vehicleModelId !== undefined, changes.vehicleModelId ?? null,
      changes.year !== undefined, changes.year ?? null, changes.vin !== undefined, changes.vin ?? null,
      changes.engineNumber !== undefined, changes.engineNumber ?? null, changes.imageUrl !== undefined, changes.imageUrl ?? null, id],
  )).rows[0];
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "vehicle.update", entityType: "customer_vehicle", entityId: id, before, after });
  return { ...after, odometer: Number(after.odometer) };
}

export async function transferVehicle(client: PoolClient, actor: Actor, vehicleId: string, customerId: string, reason: string) {
  const vehicle = (await client.query<{ customerId: string }>("SELECT customer_id AS \"customerId\" FROM app.customer_vehicles WHERE id=$1 FOR UPDATE", [vehicleId])).rows[0];
  if (!vehicle) throw new ApiError(404, "VEHICLE_NOT_FOUND", "Kendaraan tidak ditemukan");
  if (vehicle.customerId === customerId) throw new ApiError(409, "VEHICLE_OWNER_UNCHANGED", "Kendaraan sudah dimiliki pelanggan tersebut");
  const customer = await client.query("SELECT 1 FROM app.customers WHERE id=$1 AND is_active=true AND merged_into_id IS NULL FOR UPDATE", [customerId]);
  if (!customer.rowCount) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan tujuan aktif tidak ditemukan");
  const activeOrder = await client.query("SELECT 1 FROM app.service_orders WHERE vehicle_id=$1 AND status <> 'cancelled' AND (status <> 'completed' OR handed_over_at IS NULL) LIMIT 1", [vehicleId]);
  if (activeOrder.rowCount) throw new ApiError(409, "VEHICLE_TRANSFER_ACTIVE_ORDER", "Selesaikan Service Order aktif sebelum memindahkan kepemilikan");
  await client.query("UPDATE app.customer_vehicles SET customer_id=$1,updated_at=now() WHERE id=$2", [customerId, vehicleId]);
  await client.query("INSERT INTO app.vehicle_ownership_history(vehicle_id,previous_customer_id,new_customer_id,reason,transferred_by) VALUES($1,$2,$3,$4,$5)", [vehicleId, vehicle.customerId, customerId, reason, actor.id]);
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "vehicle.owner.transfer", entityType: "customer_vehicle", entityId: vehicleId, before: { customerId: vehicle.customerId }, after: { customerId, reason } });
  return { id: vehicleId, previousCustomerId: vehicle.customerId, customerId };
}

export async function mergeCustomers(client: PoolClient, actor: Actor, targetId: string, sourceId: string, reason: string) {
  if (!['owner','admin'].includes(actor.role)) throw new ApiError(403, "FORBIDDEN", "Hanya owner atau admin dapat menggabungkan pelanggan");
  if (targetId === sourceId) throw new ApiError(422, "CUSTOMER_MERGE_SAME", "Pelanggan sumber dan tujuan harus berbeda");
  const ids = [targetId, sourceId].sort();
  const locked = await client.query("SELECT id,is_active,merged_into_id,phone,email,normalized_phone,normalized_email,communication_consent,preferred_channel FROM app.customers WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
  if (locked.rowCount !== 2) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Pelanggan sumber atau tujuan tidak ditemukan");
  const source = locked.rows.find((row) => row.id === sourceId);
  const target = locked.rows.find((row) => row.id === targetId);
  if (!source?.is_active || source.merged_into_id || !target?.is_active || target.merged_into_id) throw new ApiError(409, "CUSTOMER_MERGE_INACTIVE", "Pelanggan sumber dan tujuan harus aktif serta belum digabungkan");
  const openBills = await client.query("SELECT customer_id FROM app.pos_open_bills WHERE customer_id=ANY($1::uuid[]) AND status='open' FOR UPDATE", [[targetId, sourceId]]);
  if (new Set(openBills.rows.map((bill) => bill.customer_id)).size === 2) throw new ApiError(409, "CUSTOMER_MERGE_OPEN_BILLS", "Selesaikan salah satu open bill sebelum menggabungkan pelanggan");
  const nextPhone = target.phone || source.phone;
  const nextEmail = target.email || source.email;
  const nextNormalizedPhone = target.normalized_phone || source.normalized_phone;
  const nextNormalizedEmail = target.normalized_email || source.normalized_email;
  const nextConsent = target.communication_consent;
  const nextChannel = target.preferred_channel;
  if (nextConsent && ((nextChannel === "email" && !nextNormalizedEmail) || (nextChannel !== "email" && !nextNormalizedPhone))) {
    throw new ApiError(409, "CUSTOMER_MERGE_CHANNEL_UNAVAILABLE", "Kanal komunikasi membutuhkan kontak yang sesuai");
  }
  await client.query("UPDATE app.customers SET normalized_phone=NULL,normalized_email=NULL,communication_consent=false WHERE id=$1", [sourceId]);
  await client.query(`UPDATE app.customers SET phone=$1,email=$2,normalized_phone=$3,normalized_email=$4,
    communication_consent=$5,preferred_channel=$6,updated_by=$7,updated_at=now() WHERE id=$8`,
  [nextPhone, nextEmail, nextNormalizedPhone, nextNormalizedEmail, nextConsent, nextChannel, actor.id, targetId]);
  await client.query("UPDATE app.customer_vehicles SET customer_id=$1,updated_at=now() WHERE customer_id=$2", [targetId, sourceId]);
  for (const table of ["service_orders", "customer_invoices", "customer_follow_ups", "service_reminders", "pos_sales", "service_order_feedback"]) {
    await client.query(`UPDATE app.${table} SET customer_id=$1 WHERE customer_id=$2`, [targetId, sourceId]);
  }
  await client.query("UPDATE app.pos_open_bills SET customer_id=$1,updated_by=$3,updated_at=now() WHERE customer_id=$2", [targetId, sourceId, actor.id]);
  await client.query("UPDATE app.customers SET is_active=false,merged_into_id=$1,normalized_phone=NULL,normalized_email=NULL,communication_consent=false,deactivated_at=now(),deactivated_by=$2,updated_by=$2,updated_at=now() WHERE id=$3", [targetId, actor.id, sourceId]);
  await client.query("INSERT INTO app.customer_merge_history(source_customer_id,target_customer_id,reason,merged_by) VALUES($1,$2,$3,$4)", [sourceId, targetId, reason, actor.id]);
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "customer.merge", entityType: "customer", entityId: targetId, before: { sourceCustomerId: sourceId }, after: { targetCustomerId: targetId, reason } });
  return { id: targetId, mergedCustomerId: sourceId };
}
