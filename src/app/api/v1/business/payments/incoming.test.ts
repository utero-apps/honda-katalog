import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn(), permission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.audit }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { POST } from "./route";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";

function paymentRequest(amount: number) {
  return new Request("http://localhost/api/v1/business/payments", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
    body: JSON.stringify({
      paymentNumber: "PAY-CUSTOMER-1",
      direction: "incoming",
      customerInvoiceId: invoiceId,
      amount,
      method: "cash",
      idempotencyKey: "customer-payment-key-1",
    }),
  }) as never;
}

function setupQueries(remaining: number) {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("FROM app.payments WHERE idempotency_key")) return { rows: [] };
    if (sql.includes("SELECT service_order_id FROM app.customer_invoices")) return { rows: [{ service_order_id: orderId }] };
    if (sql.includes("FROM app.service_orders s")) return { rows: [{ id: orderId, status: "invoiced", handedOverAt: null }] };
    if (sql.includes("FROM app.customer_invoices WHERE id=$1 FOR UPDATE")) return { rows: [{ id: invoiceId, total: "100000", status: "posted" }] };
    if (sql.includes("SELECT COALESCE(SUM(amount),0)::text AS paid")) return { rows: [{ paid: String(100000 - remaining) }] };
    if (sql.includes("INSERT INTO app.payments")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444", paymentNumber: "PAY-CUSTOMER-1" }] };
    return { rows: [] };
  });
}

describe("incoming customer payment transaction", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.audit.mockReset();
    mocks.permission.mockReset().mockResolvedValue({ id: actorId, role: "admin" });
  });

  it("rejects overpayment before inserting any payment", async () => {
    setupQueries(30000);
    const response = await POST(paymentRequest(40000));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PAYMENT_OVERPAY" } });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO app.payments"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("settles invoice and service order in one transaction", async () => {
    setupQueries(30000);
    const response = await POST(paymentRequest(30000));
    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls.some(([sql, params]) => String(sql).includes("UPDATE app.customer_invoices SET status") && params[0] === "paid")).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE app.service_orders SET status='paid'"))).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "finance.customer_invoice.payment" }));
  });

  it("denies payment for handed-over service orders", async () => {
    setupQueries(30000);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT service_order_id FROM app.customer_invoices")) return { rows: [{ service_order_id: orderId }] };
      if (sql.includes("FROM app.service_orders s")) return { rows: [{ id: orderId, status: "completed", handedOverAt: "2026-09-28T00:00:00Z" }] };
      return { rows: [] };
    });
    const response = await POST(paymentRequest(30000));
    expect(response.status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps stand-alone customer invoices payable without service-order updates", async () => {
    setupQueries(30000);
    const previous = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation((sql: string, values: unknown[]) =>
      sql.includes("SELECT service_order_id FROM app.customer_invoices")
        ? Promise.resolve({ rows: [{ service_order_id: null }] })
        : previous(sql, values));
    const response = await POST(paymentRequest(30000));
    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE app.service_orders"))).toBe(false);
  });
});
