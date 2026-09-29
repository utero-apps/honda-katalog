import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn(), recordAudit: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { PATCH } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };
const context = { params: Promise.resolve({ id }) };

function request(body: unknown) {
  return new Request(`http://localhost/api/v1/intelligence/reminders/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
    body: JSON.stringify(body),
  }) as never;
}

describe("reminder PATCH", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.recordAudit.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("updates status and schedule with audit", async () => {
    const before = { id, status: "sent", dueAt: "2026-10-01T09:00:00Z" };
    const after = { id, status: "pending", dueAt: "2026-10-03T09:00:00Z" };
    mocks.query.mockResolvedValueOnce({ rows: [before] }).mockResolvedValueOnce({ rows: [after] });

    const response = await PATCH(request({ status: "pending", dueAt: after.dueAt }), context);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "crm.write");
    expect(mocks.query.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(mocks.query.mock.calls[1][1]).toEqual(["pending", after.dueAt, id]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "service_reminder.update", before, after }));
    await expect(response.json()).resolves.toMatchObject({ data: after });
  });

  it.each([{ status: "sent" }, { notes: "unsupported" }, {}])("rejects invalid payload %#", async (body) => {
    const response = await PATCH(request(body), context);
    expect(response.status).toBe(422);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 404 without mutation or audit", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await PATCH(request({ status: "cancelled" }), context);
    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("menolak perubahan reminder terminal", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id, status: "cancelled", dueAt: "2026-09-29T10:00:00Z" }] });
    const response = await PATCH(request({ dueAt: "2026-10-01T10:00:00Z" }), context);
    expect(response.status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
