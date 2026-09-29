import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { createFeedbackToken, FEEDBACK_TOKEN_TTL_DAYS, hashFeedbackToken } from "@/features/service-orders/customer-feedback-token";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.object({ serviceOrderId: z.uuid() });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.create");
    if (!["owner", "admin", "cashier"].includes(user.role)) throw new ApiError(403, "FORBIDDEN", "Hanya owner, admin, atau kasir yang dapat membuat tautan rating");
    const body = await parseBody(request, input);
    const token = createFeedbackToken();
    const expiresAt = new Date(Date.now() + FEEDBACK_TOKEN_TTL_DAYS * 86_400_000);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const order = (await client.query<{ handedOverAt: Date | null; status: string }>(
        `SELECT handed_over_at AS "handedOverAt", status FROM app.service_orders WHERE id=$1 FOR UPDATE`,
        [body.serviceOrderId],
      )).rows[0];
      if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
      if (order.status !== "completed" || !order.handedOverAt) throw new ApiError(409, "FEEDBACK_NOT_READY", "Tautan rating hanya dapat dibuat setelah serah-terima");
      const existingFeedback = await client.query("SELECT 1 FROM app.service_order_feedback WHERE service_order_id=$1", [body.serviceOrderId]);
      if ((existingFeedback.rowCount ?? 0) > 0) throw new ApiError(409, "FEEDBACK_ALREADY_SUBMITTED", "Rating pelanggan sudah tersimpan");
      await client.query("UPDATE app.customer_feedback_tokens SET used_at=now() WHERE service_order_id=$1 AND used_at IS NULL", [body.serviceOrderId]);
      await client.query(
        "INSERT INTO app.customer_feedback_tokens(service_order_id,token_hash,expires_at,issued_by) VALUES($1,$2,$3,$4)",
        [body.serviceOrderId, hashFeedbackToken(token), expiresAt, user.id],
      );
      await recordAudit(client, { actorId: user.id, requestId, action: "service_order.feedback_token.issue", entityType: "service_order", entityId: body.serviceOrderId, after: { expiresAt } });
      return { path: `/service-feedback/${token}`, expiresAt };
    });
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
