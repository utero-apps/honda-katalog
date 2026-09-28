import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { GET } from "./route";

const user = { id: "22222222-2222-4222-8222-222222222222", role: "finance" };

describe("purchasing overview route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requireUser.mockReset().mockResolvedValue({ user });
  });

  it("returns purchasing, payable, and payment metrics with normalized numbers", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ totalPurchaseOrders: "2", totalReceipts: "3", purchaseValue: "550000", receivingValue: "500000", outstandingVendorDebt: "125000", outgoingVendorPayments: "75000" }] })
      .mockResolvedValueOnce({ rows: [{ purchaseOrderNumber: "PO-001", vendorName: "Vendor A", orderDate: "2026-09-02", expectedDate: "2026-09-05", status: "partially_received", receivedAt: "2026-09-03T10:00:00.000Z", total: "550000", receivedQuantity: "4", receivedValue: "500000", invoiceNumber: "INV-001", invoiceTotal: "200000", outstanding: "125000", paymentStatus: "partially_paid", invoices: [{ total: "200000", paid: "75000", outstanding: "125000" }] }] })
      .mockResolvedValueOnce({ rows: [{ purchaseValue: "550000", receivingValue: "500000", outstanding: "125000" }] })
      .mockResolvedValueOnce({ rows: [{ notDue: "25000", overdue1To30: "100000", overdue31To60: "0", overdue61Plus: "0" }] })
      .mockResolvedValueOnce({ rows: [{ status: "partially_paid", count: 1, total: "200000", outstanding: "125000" }] });

    const response = await GET(new Request("http://localhost/api/v1/intelligence/purchasing-overview?from=2026-09-01&to=2026-09-30") as never);

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual(["finance", ["purchasing.read", "finance.read"]]);
    expect(mocks.query.mock.calls[1][1]).toEqual(["2026-09-01", "2026-10-01"]);
    expect(mocks.query.mock.calls[4][1]).toEqual(["2026-10-01", "2026-09-30"]);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        range: { from: "2026-09-01", to: "2026-09-30" },
        summary: { totalPurchaseOrders: 2, purchaseValue: 550000, outstandingVendorDebt: 125000 },
        recentPurchaseChain: [{ purchaseOrderNumber: "PO-001", vendorName: "Vendor A", invoiceTotal: 200000, receivedQuantity: 4, invoices: [{ paid: 75000 }] }],
        payableAging: { overdue1To30: 100000 },
        paymentStatusComposition: [{ outstanding: 125000 }],
      },
    });
  });

  it("accepts either purchasing or finance permission", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ok: 1 }] });
    mocks.query.mockResolvedValue({ rows: [{}] });

    const response = await GET(new Request("http://localhost/api/v1/intelligence/purchasing-overview") as never);

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0][0]).toContain("permission_code=ANY");
  });

  it("redacts invoice and payment values for warehouse users", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: { ...user, role: "warehouse" } });
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ outstandingVendorDebt: "0", outgoingVendorPayments: "0" }] })
      .mockResolvedValueOnce({ rows: [{ invoiceNumber: null, outstanding: null, invoices: [] }] })
      .mockResolvedValueOnce({ rows: [{ outstanding: "0" }] })
      .mockResolvedValueOnce({ rows: [{ notDue: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await GET(new Request("http://localhost/api/v1/intelligence/purchasing-overview") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: {
      summary: { outstandingVendorDebt: null, outgoingVendorPayments: null },
      recentPurchaseChain: [{ invoiceNumber: null, invoiceTotal: null, outstanding: null, paymentStatus: null }],
      topVendors: [{ outstanding: null }],
      payableAging: null,
      paymentStatusComposition: [],
    } });
  });

  it("rejects an inverted date range", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ok: 1 }] });

    const response = await GET(new Request("http://localhost/api/v1/intelligence/purchasing-overview?from=2026-09-30&to=2026-09-01") as never);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_DATE_RANGE" } });
  });
});
