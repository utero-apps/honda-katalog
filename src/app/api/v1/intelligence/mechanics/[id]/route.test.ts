import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { GET } from "./route";

const mechanicId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: mechanicId }) };
const user = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };

describe("GET /api/v1/intelligence/mechanics/[id]", () => {
  beforeEach(() => { mocks.query.mockReset(); mocks.requirePermission.mockReset().mockResolvedValue(user); });

  it("returns scoped mechanic track with numeric metrics", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: mechanicId, name: "Budi", email: "budi@honda.local", employeeCode: "M-01", isActive: true }] })
      .mockResolvedValueOnce({ rows: [{ totalOrders: 4, completedOrders: 3, activeOrders: 1, averageHours: "2.5", fees: "125000", jobsCompleted: 5, partsConsumed: "7.5", qualityPassed: 2, qualityFailed: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "order-1", consumedParts: "2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "job-1", price: "50000" }] })
      .mockResolvedValueOnce({ rows: [{ id: "part-1", quantity: "1.5" }] })
      .mockResolvedValueOnce({ rows: [{ id: "qc-1", passed: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "fee-1", amount: "125000" }] });

    const response = await GET(new Request("http://localhost/api/v1/intelligence/mechanics/test") as never, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { profile: { name: "Budi" }, performance: { completionRate: 75, averageHours: 2.5, fees: 125000, partsConsumed: 7.5 }, orders: [{ consumedParts: 2 }], jobs: [{ price: 50000 }], parts: [{ quantity: 1.5 }], fees: [{ amount: 125000 }] } });
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "reports.read");
  });

  it("returns not found when active mechanic profile is absent", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost") as never, context);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MECHANIC_NOT_FOUND" } });
  });

  it("rejects invalid mechanic IDs before database access", async () => {
    const response = await GET(new Request("http://localhost") as never, { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("scopes all detail queries to mechanic ID", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: mechanicId, name: "Budi", email: "budi@honda.local", employeeCode: "M-01", isActive: true }] })
      .mockResolvedValueOnce({ rows: [{ totalOrders: 0, completedOrders: 0, activeOrders: 0, averageHours: "0", fees: "0", jobsCompleted: 0, partsConsumed: "0", qualityPassed: 0, qualityFailed: 0 }] })
      .mockResolvedValue({ rows: [] });
    await GET(new Request("http://localhost") as never, context);
    for (const [, values] of mocks.query.mock.calls) expect(values).toEqual([mechanicId]);
    const sql = mocks.query.mock.calls.slice(1).map(([text]) => text).join(" ");
    expect(sql).toContain("s.assigned_mechanic_id=$1");
    expect(sql).toContain("j.mechanic_id=$1 OR s.assigned_mechanic_id=$1");
    expect(sql).toContain("f.mechanic_id=$1");
  });
});
