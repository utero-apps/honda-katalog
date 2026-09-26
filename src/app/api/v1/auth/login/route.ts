import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, sessionCookie } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { ApiError, assertSameOrigin, fail, parseBody } from "@/server/http";

const input = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const session = await authenticate(body.email, (hash) => verifyPassword(body.password, hash));
    if (!session) throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau password salah");
    const response = NextResponse.json({ data: { user: { id: session.id, email: session.email, displayName: session.displayName, role: session.role } }, meta: {}, error: null });
    const cookie = sessionCookie(session.token);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return fail(error);
  }
}
