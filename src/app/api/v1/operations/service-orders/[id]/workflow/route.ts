import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { executeWorkflow, getWorkflow } from "@/features/service-orders/service";
import { workflowActionSchema } from "@/features/service-orders/schemas";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const idSchema = z.uuid();
const permissions: Record<string, string> = {
  diagnosis: "service.create", approve: "service.create", assign: "service.create", start: "service.complete", set_target_completion: "service.create", add_job: "service.complete", complete_job: "service.complete", quality_check: "service.complete", handover: "service.complete", add_evidence: "service.complete", reserve_part: "inventory.adjust", add_part: "inventory.adjust", consume_part: "inventory.adjust",
};
const rawActionSchema = z.object({ action: z.string() }).passthrough();

function normalizeAction(input: Record<string, unknown>) {
  if (input.action === "assign_mechanic") return { ...input, action: "assign" };
  if (input.action === "quality_control") return { ...input, action: "quality_check", passed: input.status === "passed" };
  if (input.action === "diagnosis") return { ...input, diagnosis: input.diagnosis ?? input.findings };
  return input;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const id = idSchema.parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => getWorkflow(client, id));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}

async function mutate(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const input = workflowActionSchema.parse(normalizeAction(await parseBody(request, rawActionSchema)));
    const user = await requirePermission(request, requestId, permissions[input.action]);
    const id = idSchema.parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, (client) => executeWorkflow(client, { id: user.id, role: user.role, requestId }, id, input));
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context); }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context); }
