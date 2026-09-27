import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { UserRole } from "@/server/db";
import { withSystemTransaction } from "@/server/db";
import { getEnv } from "@/server/env";

export interface SessionUser { id: string; email: string; displayName: string; role: UserRole; }
export interface Session extends SessionUser { sessionId: string; token: string; }

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const SESSION_TTL_HOURS = 12;
const REVOKED_SESSION_RETENTION_DAYS = 7;

export async function authenticate(email: string, passwordHashVerifier: (hash: string) => Promise<boolean>) {
  return withSystemTransaction(async (client) => {
    const result = await client.query<{ id: string; email: string; display_name: string; role: UserRole; password_hash: string }>(
      "SELECT id,email,display_name,role,password_hash FROM app.users WHERE email=$1 AND is_active=true", [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !(await passwordHashVerifier(user.password_hash))) return null;

    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [user.id]);
    await client.query(
      "UPDATE app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()",
      [user.id],
    );
    await client.query(
      `DELETE FROM app.sessions
       WHERE user_id=$1
         AND (expires_at <= now()
          OR (revoked_at IS NOT NULL AND revoked_at <= now() - ($2 * interval '1 day')))`,
      [user.id, REVOKED_SESSION_RETENTION_DAYS],
    );
    await client.query("UPDATE app.users SET last_login_at=now() WHERE id=$1", [user.id]);
    const token = crypto.randomBytes(32).toString("base64url");
    const session = await client.query<{ id: string }>(
      "INSERT INTO app.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+($3 * interval '1 hour')) RETURNING id",
      [user.id, hashToken(token), SESSION_TTL_HOURS],
    );
    return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, sessionId: session.rows[0].id, token } satisfies Session;
  });
}

export async function getRequestSession(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(getEnv().SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return withSystemTransaction(async (client) => {
    const result = await client.query<SessionUser>(`
      UPDATE app.sessions AS s
      SET last_seen_at=now()
      FROM app.users AS u
      WHERE s.user_id=u.id
        AND s.token_hash=$1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.is_active=true
      RETURNING u.id,u.email,u.display_name AS "displayName",u.role
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
  return {
    name: getEnv().SESSION_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      secure: getEnv().NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * SESSION_TTL_HOURS,
      priority: "high" as const,
    },
  };
}
