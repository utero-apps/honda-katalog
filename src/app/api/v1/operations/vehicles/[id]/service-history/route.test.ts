import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { GET } from "./route";

const vehicleId = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };
const context = { params: Promise.resolve({ id: vehicleId }) };

describe("vehicle service history route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("requires service.read and returns normalized completed service history", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: vehicleId, plateNumber: "B 1234 ABC", model: "Vario", customerId: "customer-id", customerName: "Budi" }] })
      .mockResolvedValueOnce({ rows: [{ id: "order-id", orderNumber: "SO-001", status: "completed", openedAt: "2026-09-01T00:00:00Z", completedAt: "2026-09-02T00:00:00Z", odometer: "12500", work: ["Servis berkala"], total: "175000", mechanicId: "mechanic-id", mechanicName: "Andi" }] });

    const response = await GET(new Request(`http://localhost/api/v1/operations/vehicles/${vehicleId}/service-history`) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.read");
    expect(mocks.query.mock.calls[1][0]).toContain("s.completed_at IS NOT NULL");
    expect(mocks.query.mock.calls[1][1]).toEqual([vehicleId]);
    await expect(response.json()).resolves.toMatchObject({ data: { services: [{ odometer: 12500, total: 175000, mechanic: { name: "Andi" } }] } });
  });

  it("returns 404 without querying history when vehicle does not exist", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request(`http://localhost/api/v1/operations/vehicles/${vehicleId}/service-history`) as never, context);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VEHICLE_NOT_FOUND" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
