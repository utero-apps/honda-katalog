import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { POST } from "./route";

const orderId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const warehouseId = "33333333-3333-4333-8333-333333333333";
const partId = "44444444-4444-4444-8444-444444444444";
const user = { id: "55555555-5555-4555-8555-555555555555", role: "admin" };
const context = { params: Promise.resolve({ id: orderId }) };

function request(body: unknown) {
  return new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/details`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("legacy service order detail mutation security", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it.each(["invoiced", "paid", "completed", "cancelled"])("rejects job mutation while order is %s", async (status) => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status, approvedAt: "2026-09-29T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] });
    const response = await POST(request({ action: "job", name: "Servis", price: 10000 }), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "DETAIL_ACTION_NOT_ALLOWED" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][0]).toContain("FOR UPDATE");
  });

  it.each([
    { action: "diagnosis", diagnosis: "Tidak boleh diubah" },
    { action: "reserve_part", productId, warehouseId, quantity: 1, unitPrice: 10000, unitCost: 7000 },
    { action: "consume_part", partId, idempotencyKey: "terminal-part" },
    { action: "quality_check", passed: true },
  ])("rejects $action mutation after invoicing", async (body) => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "invoiced", approvedAt: "2026-09-29T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] });
    const response = await POST(request(body), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "DETAIL_ACTION_NOT_ALLOWED" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("rejects inventory mutation before in-progress status", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "assigned", approvedAt: null, jobsOpen: 0, partsUnconsumed: 0 }] });
    const response = await POST(request({ action: "reserve_part", productId, warehouseId, quantity: 1, unitPrice: 10000, unitCost: 7000 }), context);
    expect(response.status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("returns 404 before any mutation when order does not exist", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await POST(request({ action: "job", name: "Servis", price: 10000 }), context);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_ORDER_NOT_FOUND" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { approvedAt: null, jobsOpen: 0, partsUnconsumed: 0 },
    { approvedAt: "2026-09-29T00:00:00Z", jobsOpen: 1, partsUnconsumed: 0 },
    { approvedAt: "2026-09-29T00:00:00Z", jobsOpen: 0, partsUnconsumed: 1 },
  ])("rejects QC when workflow is not ready", async (readiness) => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "in_progress", ...readiness }] });
    const response = await POST(request({ action: "quality_check", passed: true }), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "QC_NOT_READY" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("writes QC only after approval, jobs, and parts are ready", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ status: "in_progress", approvedAt: "2026-09-29T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: "qc-id", passed: true }] });
    const response = await POST(request({ action: "quality_check", passed: true, notes: "Lulus" }), context);
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][0]).toContain("app.quality_checks");
  });

  it("rejects consumed-part replay after order enters a financial state", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "paid", approvedAt: "2026-09-29T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] });
    const response = await POST(request({ action: "consume_part", partId, idempotencyKey: "consume-replay" }), context);
    expect(response.status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
