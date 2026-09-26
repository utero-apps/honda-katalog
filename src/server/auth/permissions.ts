import type { NextRequest } from "next/server";
import { ApiError } from "@/server/http";
import { getRequestSession, type SessionUser } from "@/server/auth/session";
import { withActorTransaction } from "@/server/db";

export async function requireUser(request: NextRequest, requestId: string) {
  const user = await getRequestSession(request);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Silakan login terlebih dahulu");
  return { user, requestId };
}

export async function requirePermission(request: NextRequest, requestId: string, permission: string): Promise<SessionUser> {
  const { user } = await requireUser(request, requestId);
  const access = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
    const result = await client.query("SELECT 1 FROM app.role_permissions WHERE role=$1 AND permission_code=$2", [user.role, permission]);
    return (result.rowCount ?? 0) > 0;
  });
  if (!access) throw new ApiError(403, "FORBIDDEN", "Anda tidak memiliki izin untuk tindakan ini");
  return user;
}
