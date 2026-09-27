import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) { try { const requestId = crypto.randomUUID(); const user = await requirePermission(request, requestId, "inventory.read"); const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => (await client.query("SELECT id,code,name FROM app.warehouses WHERE is_active=true ORDER BY code")).rows); return ok(data, { requestId }); } catch (error) { return fail(error); } }
