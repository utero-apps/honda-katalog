import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { storeVehicleImage } from "@/features/service-reception/vehicle-image";
import { requirePermission } from "@/server/auth/permissions";
import { assertSameOrigin, ApiError, fail, ok } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    await requirePermission(request, requestId, "service.create");
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data"))
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan multipart/form-data");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 5.5 * 1024 * 1024)
      throw new ApiError(413, "IMAGE_TOO_LARGE", "Ukuran gambar maksimal 5 MB");
    const form = await request.formData();
    const image = form.get("image");
    if (!image || typeof image === "string" || typeof image.arrayBuffer !== "function")
      throw new ApiError(422, "IMAGE_REQUIRED", "Pilih gambar kendaraan terlebih dahulu");
    return ok(await storeVehicleImage(image), { requestId });
  } catch (error) {
    return fail(error);
  }
}
