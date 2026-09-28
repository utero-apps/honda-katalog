import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn(), permission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.audit }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { POST } from "./route";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";

function reversalRequest(entityType: "payment" | "customer_invoice" = "payment") {
  return new Request("http://localhost/api/v1/business/reversals", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
    body: JSON.stringify({ entityType, entityId: entityType === "payment" ? paymentId : invoiceId, reason: "Rekonsiliasi pembayaran test" }),
  }) as never;
}

describe("customer financial reversal transaction", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.audit.mockReset();
    mocks.permission.mockReset().mockResolvedValue({ id: paymentId, role: "admin" });
  });

  it("rejects payment reversal after handover", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE app.payments")) return { rows: [{ id: paymentId, vendor_invoice_id: null, customer_invoice_id: invoiceId }] };
      if (sql.includes("FROM app.service_orders s")) return { rows: [{ id: orderId, status: "completed", handedOverAt: "2026-09-29T00:00:00Z" }] };
      return { rows: [] };
    });
    const response = await POST(reversalRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "HANDOVER_ALREADY_COMPLETED" } });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("reopens payable invoice and service order after reversal before handover", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE app.payments")) return { rows: [{ id: paymentId, vendor_invoice_id: null, customer_invoice_id: invoiceId }] };
      if (sql.includes("FROM app.service_orders s")) return { rows: [{ id: orderId, status: "paid", handedOverAt: null }] };
      if (sql.includes("FROM app.customer_invoices WHERE id=$1 FOR UPDATE")) return { rows: [{ total: "100000", status: "paid" }] };
      if (sql.includes("SELECT COALESCE(SUM(amount),0)::text AS paid")) return { rows: [{ paid: "30000" }] };
      return { rows: [] };
    });
    const response = await POST(reversalRequest());
    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls.some(([sql, params]) => String(sql).includes("UPDATE app.customer_invoices SET status") && params[0] === "partially_paid")).toBe(true);
    expect(mocks.query.mock.calls.some(([sql, params]) => String(sql).includes("UPDATE app.service_orders SET status=") && params[0] === "invoiced")).toBe(true);
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("blocks direct reversal of linked service invoices", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: orderId }] });
    const response = await POST(reversalRequest("customer_invoice"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_INVOICE_REVERSAL_UNSUPPORTED" } });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("blocks reversal of a stand-alone invoice with active payments", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: invoiceId }] })
      .mockResolvedValueOnce({ rows: [{ id: paymentId }], rowCount: 1 });
    const response = await POST(reversalRequest("customer_invoice"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVOICE_HAS_PAYMENTS" } });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE app.customer_invoices SET status='reversed'"))).toBe(false);
  });
});
