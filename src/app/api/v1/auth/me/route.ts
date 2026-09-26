import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/permissions";
import { fail, ok } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser(request, crypto.randomUUID());
    return ok({ user });
  } catch (error) {
    return fail(error);
  }
}
