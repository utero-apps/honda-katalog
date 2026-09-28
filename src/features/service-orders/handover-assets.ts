import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/http";

export const handoverChecklistSchema = z.object({
  vehicleChecked: z.boolean(),
  belongingsReturned: z.boolean(),
  keysReturned: z.boolean(),
  workExplained: z.boolean(),
  notes: z.string().trim().max(2_000).default(""),
});

export const handoverCompletionSchema = z.object({
  recipientName: z.string().trim().min(2).max(160),
  recipientAcknowledged: z.literal(true),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const handoverAssetKindSchema = z.enum(["final_photo", "signature"]);

export type HandoverChecklistInput = z.infer<typeof handoverChecklistSchema>;
export type HandoverAssetKind = z.infer<typeof handoverAssetKindSchema>;
export type HandoverActor = { id: string; requestId: string };

const imageExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type SupportedImageType = keyof typeof imageExtensions;

function hasSupportedSignature(bytes: Uint8Array, type: SupportedImageType) {
  if (type === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

export async function prepareHandoverAsset(file: File, kind: HandoverAssetKind) {
  if (!(file.type in imageExtensions))
    throw new ApiError(422, "HANDOVER_ASSET_TYPE_INVALID", "Gunakan gambar JPEG, PNG, atau WebP");
  if (kind === "signature" && file.type !== "image/png")
    throw new ApiError(422, "SIGNATURE_TYPE_INVALID", "Tanda tangan digital wajib berformat PNG");
  const maximum = kind === "signature" ? 256 * 1024 : 3 * 1024 * 1024;
  if (file.size < 32 || file.size > maximum)
    throw new ApiError(422, "HANDOVER_ASSET_SIZE_INVALID", kind === "signature" ? "Ukuran tanda tangan maksimal 256 KB" : "Ukuran foto akhir maksimal 3 MB");
  const content = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type as SupportedImageType;
  if (!hasSupportedSignature(content, mimeType))
    throw new ApiError(422, "HANDOVER_ASSET_CONTENT_INVALID", "Isi file bukan gambar yang valid");
  return {
    content: Buffer.from(content),
    mimeType,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
  };
}

async function lockEditableOrder(client: PoolClient, serviceOrderId: string) {
  const order = (await client.query<{ id: string; status: string; handedOverAt: string | null }>(
    'SELECT id,status,handed_over_at AS "handedOverAt" FROM app.service_orders WHERE id=$1 FOR UPDATE',
    [serviceOrderId],
  )).rows[0];
  if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
  if (order.handedOverAt || ["completed", "cancelled"].includes(order.status))
    throw new ApiError(409, "HANDOVER_ASSETS_LOCKED", "Data serah terima sudah dikunci");
  return order;
}

export async function getHandoverAssets(client: PoolClient, serviceOrderId: string) {
  const order = (await client.query<{ id: string; status: string; handedOverAt: string | null }>(
    'SELECT id,status,handed_over_at AS "handedOverAt" FROM app.service_orders WHERE id=$1',
    [serviceOrderId],
  )).rows[0];
  if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
  const checklist = (await client.query(
    `SELECT vehicle_checked AS "vehicleChecked",belongings_returned AS "belongingsReturned",keys_returned AS "keysReturned",work_explained AS "workExplained",notes,confirmed_by AS "confirmedBy",confirmed_at AS "confirmedAt"
     FROM app.service_order_exit_checklists WHERE service_order_id=$1`,
    [serviceOrderId],
  )).rows[0] ?? null;
  const assets = (await client.query(
    `SELECT id,kind,mime_type AS "mimeType",octet_length(content)::int AS "size",sha256,uploaded_by AS "uploadedBy",created_at AS "createdAt"
     FROM app.service_order_handover_assets WHERE service_order_id=$1 ORDER BY kind,created_at,id`,
    [serviceOrderId],
  )).rows.map((asset) => ({
    ...asset,
    url: `/api/v1/operations/service-orders/${serviceOrderId}/handover-assets/${asset.id}`,
  }));
  const checklistReady = Boolean(checklist?.vehicleChecked && checklist?.belongingsReturned && checklist?.keysReturned && checklist?.workExplained);
  const photoCount = assets.filter((asset) => asset.kind === "final_photo").length;
  const signature = assets.find((asset) => asset.kind === "signature");
  return {
    serviceOrderId,
    status: order.status,
    handedOverAt: order.handedOverAt,
    checklist,
    assets,
    readiness: { checklistReady, photoCount, hasSignature: Boolean(signature), ready: checklistReady && photoCount > 0 && Boolean(signature) },
  };
}

export async function saveHandoverChecklist(client: PoolClient, actor: HandoverActor, serviceOrderId: string, input: HandoverChecklistInput) {
  await lockEditableOrder(client, serviceOrderId);
  const checklist = (await client.query(
    `INSERT INTO app.service_order_exit_checklists(service_order_id,vehicle_checked,belongings_returned,keys_returned,work_explained,notes,confirmed_by,confirmed_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT(service_order_id) DO UPDATE SET vehicle_checked=EXCLUDED.vehicle_checked,belongings_returned=EXCLUDED.belongings_returned,keys_returned=EXCLUDED.keys_returned,work_explained=EXCLUDED.work_explained,notes=EXCLUDED.notes,confirmed_by=EXCLUDED.confirmed_by,confirmed_at=now()
     RETURNING vehicle_checked AS "vehicleChecked",belongings_returned AS "belongingsReturned",keys_returned AS "keysReturned",work_explained AS "workExplained",notes,confirmed_by AS "confirmedBy",confirmed_at AS "confirmedAt"`,
    [serviceOrderId, input.vehicleChecked, input.belongingsReturned, input.keysReturned, input.workExplained, input.notes, actor.id],
  )).rows[0];
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_order.handover_checklist.save", entityType: "service_order", entityId: serviceOrderId, after: checklist });
  return checklist;
}

export async function saveHandoverAsset(client: PoolClient, actor: HandoverActor, serviceOrderId: string, kind: HandoverAssetKind, prepared: Awaited<ReturnType<typeof prepareHandoverAsset>>) {
  await lockEditableOrder(client, serviceOrderId);
  if (kind === "final_photo") {
    const count = Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM app.service_order_handover_assets WHERE service_order_id=$1 AND kind='final_photo'",
      [serviceOrderId],
    )).rows[0]?.count ?? 0);
    if (count >= 6) throw new ApiError(409, "FINAL_PHOTO_LIMIT", "Maksimal enam foto akhir per service order");
  }
  const asset = kind === "signature"
    ? (await client.query(
        `INSERT INTO app.service_order_handover_assets(service_order_id,kind,mime_type,content,sha256,uploaded_by)
         VALUES($1,'signature',$2,$3,$4,$5)
         ON CONFLICT(service_order_id) WHERE kind='signature' DO UPDATE SET mime_type=EXCLUDED.mime_type,content=EXCLUDED.content,sha256=EXCLUDED.sha256,uploaded_by=EXCLUDED.uploaded_by,created_at=now()
         RETURNING id,kind,mime_type AS "mimeType",octet_length(content)::int AS size,sha256,created_at AS "createdAt"`,
        [serviceOrderId, prepared.mimeType, prepared.content, prepared.sha256, actor.id],
      )).rows[0]
    : (await client.query(
        `INSERT INTO app.service_order_handover_assets(service_order_id,kind,mime_type,content,sha256,uploaded_by)
         VALUES($1,'final_photo',$2,$3,$4,$5)
         RETURNING id,kind,mime_type AS "mimeType",octet_length(content)::int AS size,sha256,created_at AS "createdAt"`,
        [serviceOrderId, prepared.mimeType, prepared.content, prepared.sha256, actor.id],
      )).rows[0];
  const result = { ...asset, url: `/api/v1/operations/service-orders/${serviceOrderId}/handover-assets/${asset.id}` };
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: `service_order.handover_asset.${kind === "signature" ? "sign" : "upload"}`, entityType: "service_order", entityId: serviceOrderId, after: { id: asset.id, kind, mimeType: prepared.mimeType, sha256: prepared.sha256 } });
  return result;
}

export async function readHandoverAsset(client: PoolClient, serviceOrderId: string, assetId: string) {
  const asset = (await client.query<{ content: Buffer; mimeType: string; sha256: string }>(
    `SELECT content,mime_type AS "mimeType",sha256 FROM app.service_order_handover_assets WHERE id=$1 AND service_order_id=$2`,
    [assetId, serviceOrderId],
  )).rows[0];
  if (!asset) throw new ApiError(404, "HANDOVER_ASSET_NOT_FOUND", "Aset serah terima tidak ditemukan");
  return asset;
}

export async function assertHandoverAssetsReady(client: PoolClient, serviceOrderId: string) {
  await lockEditableOrder(client, serviceOrderId);
  const result = (await client.query<{
    checklistReady: boolean;
    photoCount: number;
    signatureId: string | null;
  }>(
    `SELECT
      EXISTS(SELECT 1 FROM app.service_order_exit_checklists c WHERE c.service_order_id=$1 AND c.vehicle_checked AND c.belongings_returned AND c.keys_returned AND c.work_explained) AS "checklistReady",
      (SELECT count(*)::int FROM app.service_order_handover_assets a WHERE a.service_order_id=$1 AND a.kind='final_photo') AS "photoCount",
      (SELECT id FROM app.service_order_handover_assets a WHERE a.service_order_id=$1 AND a.kind='signature' LIMIT 1) AS "signatureId"`,
    [serviceOrderId],
  )).rows[0];
  const fields: Record<string, string[]> = {};
  if (!result.checklistReady) fields.checklist = ["Semua checklist keluar wajib dikonfirmasi"];
  if (result.photoCount < 1) fields.finalPhotos = ["Minimal satu foto akhir wajib diunggah"];
  if (!result.signatureId) fields.signature = ["Tanda tangan penerima wajib tersedia"];
  if (Object.keys(fields).length) throw new ApiError(409, "HANDOVER_ASSETS_INCOMPLETE", "Data serah terima belum lengkap", fields);
  return { signatureReference: `/api/v1/operations/service-orders/${serviceOrderId}/handover-assets/${result.signatureId}` };
}

export const handoverAssetLimits = {
  finalPhotoBytes: 3 * 1024 * 1024,
  signatureBytes: 256 * 1024,
  maximumFinalPhotos: 6,
  acceptedTypes: Object.keys(imageExtensions),
};
