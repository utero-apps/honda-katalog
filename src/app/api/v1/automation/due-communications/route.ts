import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { processDueCommunications } from "@/features/automation/due-communications";
import { requirePermission } from "@/server/auth/permissions";
import { withSystemTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(100) });

function validJobToken(request: NextRequest) {
  const expected = process.env.AUTOMATION_JOB_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 24 || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    if (validJobToken(request)) {
      const body = await parseBody(request, input);
      const data = await withSystemTransaction((client) => processDueCommunications(client, { limit: body.limit, workerId: `job:${requestId}` }));
      return ok(data, { requestId });
    }
    assertSameOrigin(request);
    const user = await requirePermission(request, requestId, "crm.write");
    if (user.role !== "owner" && user.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "Hanya owner atau admin dapat menjalankan otomasi");
    }
    const body = await parseBody(request, input);
    const data = await withSystemTransaction(
      (client) => processDueCommunications(client, { limit: body.limit, workerId: `user:${user.id}` }),
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}

