import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/db", () => ({
  withActorTransaction: (
    _identity: unknown,
    work: (client: { query: typeof mocks.query }) => unknown,
  ) => work({ query: mocks.query }),
}));

import { GET } from "./route";

const vendorId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: vendorId }) };

describe("vendor detail route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "finance",
    });
  });

  it("returns normalized purchasing and finance history", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: vendorId, code: "V-01", name: "Vendor Satu" }] })
      .mockResolvedValueOnce({ rows: [{ productId: "p-1", lastPrice: "125000" }] })
      .mockResolvedValueOnce({ rows: [{ id: "po-1", total: "250000", orderedQuantity: "2", receivedQuantity: "1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "gr-1", quantity: "1", value: "125000" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inv-1", status: "partially_paid", total: "250000", paid: "100000" }] })
      .mockResolvedValueOnce({ rows: [{ outstanding: "150000" }] })
      .mockResolvedValueOnce({ rows: [{ id: "pay-1", amount: "100000" }] });

    const response = await GET(
      new Request(`http://localhost/api/v1/business/vendors/${vendorId}`) as never,
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "purchasing.read",
    );
    expect(mocks.query).toHaveBeenCalledTimes(7);
    expect(mocks.query.mock.calls.every((call) => call[1]?.[0] === vendorId)).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        products: [{ lastPrice: 125000 }],
        purchaseOrders: [{ total: 250000, orderedQuantity: 2, receivedQuantity: 1 }],
        receipts: [{ quantity: 1, value: 125000 }],
        outstanding: 150000,
        invoices: [{ total: 250000, paid: 100000, outstanding: 150000 }],
        payments: [{ amount: 100000 }],
      },
    });
  });

  it("redacts invoice and payment data for warehouse", async () => {
    mocks.requirePermission.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      role: "warehouse",
    });
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: vendorId, code: "V-01", name: "Vendor Satu" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await GET(
      new Request(`http://localhost/api/v1/business/vendors/${vendorId}`) as never,
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(4);
    await expect(response.json()).resolves.toMatchObject({
      data: { outstanding: null, invoices: null, payments: null },
    });
  });

  it("returns not found when vendor does not exist", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(
      new Request(`http://localhost/api/v1/business/vendors/${vendorId}`) as never,
      context,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VENDOR_NOT_FOUND" },
    });
  });

  it("rejects an invalid vendor id", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/business/vendors/not-a-uuid") as never,
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );

    expect(response.status).toBe(422);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
