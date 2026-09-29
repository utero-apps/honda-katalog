import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { processDueCommunications } from "@/features/automation/due-communications";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "crm.write");
    if (user.role !== "owner" && user.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "Hanya owner atau admin dapat menjalankan otomasi");
    }
    const body = await parseBody(request, input);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      (client) => processDueCommunications(client, { id: user.id, requestId }, { limit: body.limit }),
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}

