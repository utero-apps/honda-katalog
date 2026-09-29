import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const idSchema = z.uuid();
const input = z
  .strictObject({
    status: z.enum(["pending", "completed", "cancelled"]).optional(),
    dueAt: z.iso.datetime().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Minimal satu perubahan wajib diisi",
  });

type FollowUp = {
  id: string;
  status: "pending" | "completed" | "cancelled";
  dueAt: string;
  notes: string | null;
  completedAt: string | null;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "crm.write");
    const id = idSchema.parse((await context.params).id);
    const body = await parseBody(request, input);
    const data = await withActorTransaction(
      { userId: user.id, role: user.role, requestId },
      async (client) => {
        const before = (
          await client.query<FollowUp>(
            `SELECT id,status,due_at AS "dueAt",notes,completed_at AS "completedAt"
             FROM app.customer_follow_ups WHERE id=$1 FOR UPDATE`,
            [id],
          )
        ).rows[0];
        if (!before)
          throw new ApiError(404, "FOLLOW_UP_NOT_FOUND", "Follow-up tidak ditemukan");
        if (["completed", "cancelled"].includes(before.status) && (body.status !== undefined || body.dueAt !== undefined)) {
          throw new ApiError(409, "FOLLOW_UP_TERMINAL", "Follow-up selesai atau dibatalkan tidak dapat dijadwalkan ulang");
        }

        const after = (
          await client.query<FollowUp>(
            `UPDATE app.customer_follow_ups
             SET status=COALESCE($1,status),due_at=COALESCE($2,due_at),notes=CASE WHEN $3 THEN $4 ELSE notes END,
                 completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END
             WHERE id=$5
             RETURNING id,status,due_at AS "dueAt",notes,completed_at AS "completedAt"`,
            [body.status ?? null, body.dueAt ?? null, body.notes !== undefined, body.notes ?? null, id],
          )
        ).rows[0];
        await recordAudit(client, {
          actorId: user.id,
          requestId,
          action: "customer_follow_up.update",
          entityType: "customer_follow_up",
          entityId: id,
          before,
          after,
        });
        return after;
      },
    );
    return ok(data, { requestId });
  } catch (error) {
    return fail(error);
  }
}
