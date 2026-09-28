import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getHandoverAssets,
  handoverAssetKindSchema,
  handoverAssetLimits,
  handoverChecklistSchema,
  prepareHandoverAsset,
  saveHandoverAsset,
  saveHandoverChecklist,
} from "@/features/service-orders/handover-assets";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

export async function GET(request: NextRequest, context: Context) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const id = idSchema.parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getHandoverAssets(client, id));
    const response = ok(data, { requestId });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return fail(error); }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.create");
    const id = idSchema.parse((await context.params).id);
    const input = await parseBody(request, handoverChecklistSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => saveHandoverChecklist(client, { id: user.id, requestId }, id, input));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.create");
    const id = idSchema.parse((await context.params).id);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;"))
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan multipart/form-data");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > handoverAssetLimits.finalPhotoBytes + 64 * 1024)
      throw new ApiError(413, "HANDOVER_ASSET_TOO_LARGE", "Ukuran unggahan melebihi batas");
    const form = await request.formData();
    const kind = handoverAssetKindSchema.parse(form.get("kind"));
    const image = form.get("image");
    if (!(image instanceof File)) throw new ApiError(422, "HANDOVER_ASSET_REQUIRED", "Pilih foto akhir atau tanda tangan PNG");
    const prepared = await prepareHandoverAsset(image, kind);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => saveHandoverAsset(client, { id: user.id, requestId }, id, kind, prepared));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
