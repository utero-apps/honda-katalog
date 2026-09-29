import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn(), recordAudit: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { PATCH } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };
const context = { params: Promise.resolve({ id }) };

function request(body: unknown, origin = "http://localhost") {
  return new Request(`http://localhost/api/v1/intelligence/follow-ups/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin, host: "localhost" },
    body: JSON.stringify(body),
  }) as never;
}

describe("follow-up PATCH", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.recordAudit.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("updates status, schedule, notes, and records audit", async () => {
    const before = { id, status: "pending", dueAt: "2026-10-01T09:00:00Z", notes: null, completedAt: null };
    const after = { ...before, status: "completed", dueAt: "2026-10-02T09:00:00Z", notes: "Sudah dihubungi", completedAt: "2026-09-29T10:00:00Z" };
    mocks.query.mockResolvedValueOnce({ rows: [before] }).mockResolvedValueOnce({ rows: [after] });

    const response = await PATCH(request({ status: "completed", dueAt: after.dueAt, notes: after.notes }), context);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "crm.write");
    expect(mocks.query.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(mocks.query.mock.calls[1][1]).toEqual(["completed", after.dueAt, true, after.notes, id]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "customer_follow_up.update", before, after }));
    await expect(response.json()).resolves.toMatchObject({ data: after });
  });

  it("rejects empty payload and cross-origin requests", async () => {
    expect((await PATCH(request({}), context)).status).toBe(422);
    expect((await PATCH(request({ status: "pending" }, "https://evil.example"), context)).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 404 without mutation or audit", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await PATCH(request({ status: "cancelled" }), context);
    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("menolak membuka ulang follow-up terminal", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id, status: "completed", dueAt: "2026-09-29T10:00:00Z", notes: null, completedAt: "2026-09-29T10:00:00Z" }] });
    const response = await PATCH(request({ status: "pending" }), context);
    expect(response.status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
