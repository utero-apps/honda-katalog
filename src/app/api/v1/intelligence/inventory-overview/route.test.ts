import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { GET } from "./route";

const warehouseId = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };

describe("inventory overview route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("returns normalized inventory metrics scoped by warehouse and date", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ totalItems: 2, inventoryValue: "500000", incomingValue: "120000", outgoingValue: "45000", incomingTransactions: 3, outgoingTransactions: 2, lowStockCount: 1 }] })
      .mockResolvedValueOnce({ rows: [{ warehouseId, warehouseCode: "WH-01", warehouseName: "Utama", totalItems: 2, quantity: "20", reservedQuantity: "3", availableQuantity: "17", value: "500000", lowStockCount: 1 }] })
      .mockResolvedValueOnce({ rows: [{ date: "2026-09-01", incoming: "5", outgoing: "2", incomingValue: "120000", outgoingValue: "45000" }] })
      .mockResolvedValueOnce({ rows: [{ productId: "product-id", partCode: "ABC", name: "Oli", unit: "pcs", quantity: "2", value: "45000", transactions: 2 }] })
      .mockResolvedValueOnce({ rows: [{ productId: "product-id", partCode: "ABC", name: "Oli", unit: "pcs", minimumStock: "5", quantity: "2", reservedQuantity: "1", availableQuantity: "1", value: "50000" }] });

    const request = new Request(`http://localhost/api/v1/intelligence/inventory-overview?warehouseId=${warehouseId}&from=2026-09-01&to=2026-09-30`) as never;
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "inventory.read");
    expect(mocks.query.mock.calls[0][1]).toEqual([warehouseId, "2026-09-01", "2026-10-01"]);
    expect(mocks.query.mock.calls[0][0]).toContain("quantity*hpp");
    await expect(response.json()).resolves.toMatchObject({ data: { summary: { inventoryValue: 500000, outgoingValue: 45000 }, stockOverview: [{ availableQuantity: 17 }], topUsed: [{ quantity: 2 }], lowStock: [{ minimumStock: 5 }] } });
  });

  it("rejects an inverted date range before querying inventory", async () => {
    const response = await GET(new Request("http://localhost/api/v1/intelligence/inventory-overview?from=2026-09-30&to=2026-09-01") as never);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_DATE_RANGE" } });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("redacts HPP-derived values for warehouse users", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ ...user, role: "warehouse" });
    mocks.query
      .mockResolvedValueOnce({ rows: [{ totalItems: 1, inventoryValue: "500000", incomingValue: "120000", outgoingValue: "45000", incomingTransactions: 1, outgoingTransactions: 1, lowStockCount: 0 }] })
      .mockResolvedValueOnce({ rows: [{ value: "500000" }] })
      .mockResolvedValueOnce({ rows: [{ date: "2026-09-01", incoming: "1", outgoing: "1", incomingValue: "120000", outgoingValue: "45000" }] })
      .mockResolvedValueOnce({ rows: [{ value: "45000" }] })
      .mockResolvedValueOnce({ rows: [{ value: "50000" }] });
    const response = await GET(new Request("http://localhost/api/v1/intelligence/inventory-overview?from=2026-09-01&to=2026-09-01") as never);
    await expect(response.json()).resolves.toMatchObject({ data: { summary: { inventoryValue: null, incomingValue: null, outgoingValue: null }, stockOverview: [{ value: null }], movementTrend: [{ incomingValue: null, outgoingValue: null }], topUsed: [{ value: null }], lowStock: [{ value: null }] } });
  });
});
