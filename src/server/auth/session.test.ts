import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/server/db", () => ({
  withSystemTransaction: (work: (client: { query: typeof query }) => unknown) => work({ query }),
}));

vi.mock("@/server/env", () => ({
  getEnv: () => ({ SESSION_COOKIE_NAME: "test_session", NODE_ENV: "production" }),
}));

import { authenticate, getRequestSession, revokeRequestSession, sessionCookie } from "@/server/auth/session";

const user = {
  id: "9d6dffdd-1994-4986-aa99-875e917cc7a4",
  email: "owner@example.com",
  display_name: "Owner",
  role: "owner" as const,
  password_hash: "stored-hash",
};

function requestWithToken(token?: string) {
  return {
    cookies: { get: () => token ? { value: token } : undefined },
  } as never;
}

describe("session security", () => {
  beforeEach(() => query.mockReset());

  it("serializes login and revokes existing sessions before creating a replacement", async () => {
    query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "new-session" }] });

    const result = await authenticate(user.email, async (hash) => hash === user.password_hash);

    expect(result?.sessionId).toBe("new-session");
    expect(query.mock.calls[1][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining("UPDATE app.sessions SET revoked_at=now()"),
      [user.id],
    ]);
    expect(query.mock.calls[3][0]).toContain("DELETE FROM app.sessions");
    expect(query.mock.calls[3][1]).toEqual([user.id, 7]);
    expect(query.mock.calls[5][1][0]).toBe(user.id);
    expect(query.mock.calls[5][1][1]).toBe(createHash("sha256").update(result!.token).digest("hex"));
    expect(query.mock.calls[5][1][2]).toBe(12);
  });

  it("does not rotate sessions when credentials fail", async () => {
    query.mockResolvedValueOnce({ rows: [user] });

    await expect(authenticate(user.email, async () => false)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("accepts only active sessions and refreshes last-seen timestamp", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: user.id, email: user.email, displayName: user.display_name, role: user.role }] });

    const result = await getRequestSession(requestWithToken("secret-token"));

    expect(result?.id).toBe(user.id);
    expect(query.mock.calls[0][0]).toContain("SET last_seen_at=now()");
    expect(query.mock.calls[0][0]).toContain("s.revoked_at IS NULL");
    expect(query.mock.calls[0][0]).toContain("s.expires_at > now()");
    expect(query.mock.calls[0][1]).toEqual([createHash("sha256").update("secret-token").digest("hex")]);
  });

  it("revokes the presented token and creates a hardened cookie", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await revokeRequestSession(requestWithToken("secret-token"));

    expect(query.mock.calls[0][1]).toEqual([createHash("sha256").update("secret-token").digest("hex")]);
    expect(sessionCookie("new-token")).toEqual({
      name: "test_session",
      value: "new-token",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 43_200,
        priority: "high",
      },
    });
  });
});
