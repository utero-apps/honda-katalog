import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { readHandoverAsset } from "@/features/service-orders/handover-assets";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail } from "@/server/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const params = await context.params;
    const id = z.uuid().parse(params.id);
    const assetId = z.uuid().parse(params.assetId);
    const asset = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => readHandoverAsset(client, id, assetId));
    return new Response(new Uint8Array(asset.content), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "ETag": `"${asset.sha256}"`,
      },
    });
  } catch (error) { return fail(error); }
}
