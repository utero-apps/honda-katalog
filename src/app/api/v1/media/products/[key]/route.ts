import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readProductImage } from "@/features/catalog/product-image";
import { requirePermission } from "@/server/auth/permissions";
import { fail } from "@/server/http";

const keySchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/,
  "Kunci gambar tidak valid",
);

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const requestId = crypto.randomUUID();
    await requirePermission(request, requestId, "catalog.read");
    const key = keySchema.parse((await context.params).key);
    const image = await readProductImage(key);
    return new NextResponse(image.bytes, {
      headers: {
        "Content-Type": image.type,
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
