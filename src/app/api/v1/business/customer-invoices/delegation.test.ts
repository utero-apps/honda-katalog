import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServiceInvoice: vi.fn(), permission: vi.fn(), query: vi.fn() }));
vi.mock("@/features/service-orders/service", () => ({ createServiceInvoice: mocks.createServiceInvoice }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { POST } from "./route";

describe("legacy customer invoice delegates readiness", () => {
  beforeEach(() => {
    mocks.permission.mockReset().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", role: "admin" });
    mocks.createServiceInvoice.mockReset().mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", invoiceNumber: "SINV-NEW", total: 10000 });
    mocks.query.mockReset();
  });

  it("returns actual generated invoice from canonical service, never writes legacy invoice directly", async () => {
    const response = await POST(new Request("http://localhost/api/v1/business/customer-invoices", {
      method: "POST",
      headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ invoiceNumber: "LEGACY-1", serviceOrderId: "11111111-1111-4111-8111-111111111111", discount: 0, tax: 0 }),
    }) as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { invoiceNumber: "SINV-NEW" } });
    expect(mocks.createServiceInvoice).toHaveBeenCalledWith(expect.anything(), expect.anything(), "11111111-1111-4111-8111-111111111111", { action: "create", discount: 0, tax: 0, dueAt: undefined });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
