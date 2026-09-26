import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { UserRole } from "@/server/db";
import { withSystemTransaction } from "@/server/db";
import { getEnv } from "@/server/env";

export interface SessionUser { id: string; email: string; displayName: string; role: UserRole; }
export interface Session extends SessionUser { sessionId: string; token: string; }

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function authenticate(email: string, passwordHashVerifier: (hash: string) => Promise<boolean>) {
  return withSystemTransaction(async (client) => {
    const result = await client.query<{ id: string; email: string; display_name: string; role: UserRole; password_hash: string }>(
      "SELECT id,email,display_name,role,password_hash FROM app.users WHERE email=$1 AND is_active=true", [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !(await passwordHashVerifier(user.password_hash))) return null;
    await client.query("UPDATE app.users SET last_login_at=now() WHERE id=$1", [user.id]);
    const token = crypto.randomBytes(32).toString("base64url");
    const session = await client.query<{ id: string }>(
      "INSERT INTO app.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours') RETURNING id", [user.id, hashToken(token)]
    );
    return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, sessionId: session.rows[0].id, token } satisfies Session;
  });
}

export async function getRequestSession(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(getEnv().SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return withSystemTransaction(async (client) => {
    const result = await client.query<SessionUser>(`
      SELECT u.id,u.email,u.display_name AS "displayName",u.role
      FROM app.sessions s JOIN app.users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active=true
    `, [hashToken(token)]);
    return result.rows[0] ?? null;
  });
}

export async function revokeRequestSession(request: NextRequest) {
  const token = request.cookies.get(getEnv().SESSION_COOKIE_NAME)?.value;
  if (!token) return;
  await withSystemTransaction((client) => client.query("UPDATE app.sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [hashToken(token)]));
}

export function sessionCookie(token: string) {
  return { name: getEnv().SESSION_COOKIE_NAME, value: token, options: { httpOnly: true, secure: getEnv().NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 } };
}
