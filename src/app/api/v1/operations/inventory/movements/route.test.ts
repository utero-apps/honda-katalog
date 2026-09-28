import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { GET, movementInput } from "./route";

const baseMovement = {
  warehouseId: "11111111-1111-4111-8111-111111111111",
  productId: "22222222-2222-4222-8222-222222222222",
  unitCost: 0,
  referenceType: "manual_adjustment",
  idempotencyKey: "movement-test-key",
};

describe("inventory movement input", () => {
  it.each([
    ["opening", 1],
    ["receiving", 1],
    ["adjustment_in", 1],
    ["return_in", 1],
    ["service_usage", -1],
    ["adjustment_out", -1],
    ["return_out", -1],
    ["opname", -1],
    ["opname", 1],
  ] as const)("accepts %s with quantity %i", (movementType, quantity) => {
    expect(movementInput.safeParse({ ...baseMovement, movementType, quantity }).success).toBe(true);
  });

  it.each([
    ["opening", -1],
    ["receiving", -1],
    ["adjustment_in", -1],
    ["return_in", -1],
    ["service_usage", 1],
    ["adjustment_out", 1],
    ["return_out", 1],
  ] as const)("rejects invalid sign for %s", (movementType, quantity) => {
    expect(movementInput.safeParse({ ...baseMovement, movementType, quantity }).success).toBe(false);
  });
});

describe("inventory movement listing", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", role: "admin" });
  });

  it("filters movements and returns newest normalized records", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "movement-id", movementType: "service_usage", quantity: "-2", unitCost: "25000", value: "50000", referenceType: "service_order", referenceId: "44444444-4444-4444-8444-444444444444", reason: null, occurredAt: "2026-09-28T10:00:00Z", productId: baseMovement.productId, partCode: "ABC", productName: "Oli", unit: "pcs", warehouseId: baseMovement.warehouseId, warehouseCode: "WH-01", warehouseName: "Utama", actorId: "actor-id", actorName: "Petugas" }] });
    const request = new Request(`http://localhost/api/v1/operations/inventory/movements?warehouseId=${baseMovement.warehouseId}&productId=${baseMovement.productId}&movementType=service_usage&from=2026-09-01&to=2026-09-28&limit=25`) as never;

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "inventory.read");
    expect(mocks.query.mock.calls[0][0]).toContain("ORDER BY m.occurred_at DESC,m.id DESC");
    expect(mocks.query.mock.calls[0][1]).toEqual([baseMovement.warehouseId, baseMovement.productId, "service_usage", "2026-09-01", "2026-09-29", 25]);
    await expect(response.json()).resolves.toMatchObject({ data: [{ quantity: -2, unitCost: 25000, value: 50000, productName: "Oli", warehouseName: "Utama", actorName: "Petugas" }] });
  });

  it("rejects invalid movement filters without querying", async () => {
    const response = await GET(new Request("http://localhost/api/v1/operations/inventory/movements?limit=1000") as never);
    expect(response.status).toBe(422);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("redacts unit cost and movement value for warehouse users", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ id: "33333333-3333-4333-8333-333333333333", role: "warehouse" });
    mocks.query.mockResolvedValueOnce({ rows: [{ quantity: "-1", unitCost: "25000", value: "25000" }] });
    const response = await GET(new Request("http://localhost/api/v1/operations/inventory/movements") as never);
    await expect(response.json()).resolves.toMatchObject({ data: [{ quantity: -1, unitCost: null, value: null }] });
  });
});
