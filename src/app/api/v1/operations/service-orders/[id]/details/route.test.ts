import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { POST } from "./route";

const orderId = "11111111-1111-4111-8111-111111111111";
const mechanicId = "22222222-2222-4222-8222-222222222222";
const user = { id: "33333333-3333-4333-8333-333333333333", role: "admin" };

function diagnosisRequest() {
  return new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/details`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "diagnosis", diagnosis: "Perlu penggantian bearing", assignedMechanicId: mechanicId }),
  }) as never;
}

const context = { params: Promise.resolve({ id: orderId }) };

describe("service order diagnosis", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("does not change an in-progress order status", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ status: "in_progress" }] })
      .mockResolvedValueOnce({ rows: [{ id: orderId, status: "in_progress" }] });

    const response = await POST(diagnosisRequest(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "in_progress" } });
    expect(mocks.query.mock.calls[1]).toEqual([expect.stringContaining("status=$3"), ["Perlu penggantian bearing", mechanicId, "in_progress", user.id, orderId]]);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("records only the valid open-to-assigned transition", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ id: orderId, status: "assigned" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(diagnosisRequest(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "assigned" } });
    expect(mocks.query.mock.calls[2]).toEqual([expect.stringContaining("service_order_status_history"), [orderId, "open", "assigned", "Mekanik ditugaskan", user.id]]);
  });
});
