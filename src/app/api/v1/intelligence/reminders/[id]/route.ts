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
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Minimal satu perubahan wajib diisi",
  });

type Reminder = {
  id: string;
  status: "pending" | "sent" | "completed" | "cancelled";
  dueAt: string;
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
          await client.query<Reminder>(
            `SELECT id,status,due_at AS "dueAt"
             FROM app.service_reminders WHERE id=$1 FOR UPDATE`,
            [id],
          )
        ).rows[0];
        if (!before)
          throw new ApiError(404, "REMINDER_NOT_FOUND", "Reminder tidak ditemukan");
        if (["completed", "cancelled"].includes(before.status)) {
          throw new ApiError(409, "REMINDER_TERMINAL", "Reminder selesai atau dibatalkan tidak dapat diubah");
        }

        const after = (
          await client.query<Reminder>(
            `UPDATE app.service_reminders
             SET status=COALESCE($1,status),due_at=COALESCE($2,due_at)
             WHERE id=$3
             RETURNING id,status,due_at AS "dueAt"`,
            [body.status ?? null, body.dueAt ?? null, id],
          )
        ).rows[0];
        await recordAudit(client, {
          actorId: user.id,
          requestId,
          action: "service_reminder.update",
          entityType: "service_reminder",
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
