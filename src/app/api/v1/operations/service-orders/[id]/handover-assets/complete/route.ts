import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { assertHandoverAssetsReady, handoverCompletionSchema } from "@/features/service-orders/handover-assets";
import { executeWorkflow } from "@/features/service-orders/service";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.create");
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, handoverCompletionSchema);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const { signatureReference } = await assertHandoverAssetsReady(client, id);
      const workflow = await executeWorkflow(client, { id: user.id, role: user.role, requestId }, id, { action: "handover", recipientName: input.recipientName, signatureReference, notes: input.notes });
      await recordAudit(client, { actorId: user.id, requestId, action: "service_order.handover.recipient_acknowledged", entityType: "service_order", entityId: id, after: { acknowledged: input.recipientAcknowledged, signatureReference } });
      return workflow;
    });
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
