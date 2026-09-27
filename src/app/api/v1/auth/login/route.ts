import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, sessionCookie } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { ApiError, assertSameOrigin, fail, parseBody } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { log } from "@/server/log";

const input = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    enforceRateLimit(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const body = await parseBody(request, input);
    const session = await authenticate(body.email, (hash) => verifyPassword(body.password, hash));
    if (!session) { log("auth.login_failed", { email: body.email }); throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau password salah"); }
    const response = NextResponse.json({ data: { user: { id: session.id, email: session.email, displayName: session.displayName, role: session.role } }, meta: {}, error: null });
    const cookie = sessionCookie(session.token);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    log("auth.login_succeeded", { userId: session.id, role: session.role });
    return response;
  } catch (error) {
    return fail(error);
  }
}
