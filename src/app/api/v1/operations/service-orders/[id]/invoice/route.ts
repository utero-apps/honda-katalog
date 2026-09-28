import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceInvoice, getInvoiceReadiness, getWorkflow, recordServiceInvoicePayment } from "@/features/service-orders/service";
import { invoiceInputSchema } from "@/features/service-orders/schemas";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const idSchema = z.uuid();

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "finance.read");
    const id = idSchema.parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getInvoiceReadiness(client, id));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const id = idSchema.parse((await context.params).id);
    const input = await parseBody(request, invoiceInputSchema);
    const user = await requirePermission(request, requestId, input.action === "record_payment" ? "finance.pay" : "finance.post");
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      if (input.action === "record_payment") return recordServiceInvoicePayment(client, { id: user.id, role: user.role, requestId }, id, input);
      await createServiceInvoice(client, { id: user.id, role: user.role, requestId }, id, input);
      return getWorkflow(client, id);
    });
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
