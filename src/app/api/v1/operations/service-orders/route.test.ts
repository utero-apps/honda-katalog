import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { POST } from "./route";

const customerId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "22222222-2222-4222-8222-222222222222";
const user = { id: "33333333-3333-4333-8333-333333333333", role: "admin" };

function request() {
  return new Request("http://localhost/api/v1/operations/service-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber: "SO-001", customerId, vehicleId, complaint: "Mesin berisik" }),
  }) as never;
}

describe("service order creation", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("rejects a vehicle that does not belong to customer", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const response = await POST(request());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VEHICLE_CUSTOMER_MISMATCH" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]).toEqual([expect.stringContaining("customer_vehicles WHERE id=$1 AND customer_id=$2"), [vehicleId, customerId]]);
  });

  it("creates an order only after ownership is confirmed", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "order-id", orderNumber: "SO-001", status: "open" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: "order-id", status: "open" } });
    expect(mocks.query.mock.calls[1]).toEqual([expect.stringContaining("INSERT INTO app.service_orders"), ["SO-001", customerId, vehicleId, null, "Mesin berisik", null, user.id]]);
  });
});
