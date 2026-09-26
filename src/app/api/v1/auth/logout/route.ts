import { NextRequest, NextResponse } from "next/server";
import { revokeRequestSession } from "@/server/auth/session";
import { assertSameOrigin, fail } from "@/server/http";
import { getEnv } from "@/server/env";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await revokeRequestSession(request);
    const response = NextResponse.json({ data: { success: true }, meta: {}, error: null });
    response.cookies.set(getEnv().SESSION_COOKIE_NAME, "", { httpOnly: true, secure: getEnv().NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return fail(error);
  }
}
