import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({
  withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }),
}));

import { POST as mutateDetails } from "./[id]/details/route";
import { PATCH as changeStatus } from "./[id]/status/route";
import { POST as mutateWorkflow } from "./[id]/workflow/route";

const orderId = "11111111-1111-4111-8111-111111111111";
const partId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const warehouseId = "44444444-4444-4444-8444-444444444444";
const user = { id: "55555555-5555-4555-8555-555555555555", role: "admin" };
const context = { params: Promise.resolve({ id: orderId }) };

function request(path: string, body: unknown, origin = "http://localhost") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", origin },
    body: JSON.stringify(body),
  }) as never;
}

function statusRequest(status: string) {
  return request(`/api/v1/operations/service-orders/${orderId}/status`, { status, reason: "Workflow test" });
}

function detailRequest(body: unknown) {
  return request(`/api/v1/operations/service-orders/${orderId}/details`, body);
}

describe("service order workflow", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("[P0] rejects cross-origin workflow mutations before authorization", async () => {
    const denied = await changeStatus(request(`/api/v1/operations/service-orders/${orderId}/status`, { status: "quality_check" }, "https://attacker.invalid") as never, context);
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ error: { code: "ORIGIN_DENIED" } });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("[P0] rejects missing orders and invalid state transitions without updating history", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const missing = await changeStatus(statusRequest("in_progress"), context);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "SERVICE_ORDER_NOT_FOUND" } });

    mocks.query.mockReset().mockResolvedValueOnce({ rows: [{ status: "open" }] });
    const invalid = await changeStatus(statusRequest("paid"), context);
    expect(invalid.status).toBe(409);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "INVALID_STATE_TRANSITION" } });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("[P0] records valid status transition and actor history", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ status: "draft" }] })
      .mockResolvedValueOnce({ rows: [{ id: orderId, status: "open" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await changeStatus(statusRequest("open"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: orderId, status: "open" } });
    expect(mocks.query.mock.calls[2]).toEqual([
      expect.stringContaining("service_order_status_history"),
      [orderId, "draft", "open", "Workflow test", user.id],
    ]);
  });

  it("[P0] rejects financial and terminal status bypasses from the legacy status route", async () => {
    for (const [currentStatus, requestedStatus] of [
      ["quality_check", "invoiced"],
      ["quality_check", "completed"],
      ["invoiced", "paid"],
      ["paid", "completed"],
      ["open", "in_progress"],
      ["assigned", "in_progress"],
      ["in_progress", "quality_check"],
    ] as const) {
      mocks.query.mockReset().mockResolvedValueOnce({
        rows: [{ status: currentStatus }],
      });

      const response = await changeStatus(statusRequest(requestedStatus), context);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_STATE_TRANSITION" },
      });
      expect(mocks.query).toHaveBeenCalledTimes(1);
    }
  });

  it("[P0] restricts mechanics to their assigned Service Order and blocks mechanic handover", async () => {
    const mechanic = { ...user, role: "mechanic" };
    mocks.requirePermission.mockResolvedValue(mechanic);
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: orderId, status: "in_progress", customer_id: "customer-id", assigned_mechanic_id: crypto.randomUUID(), approved_at: "2026-09-28T00:00:00Z", diagnosis: "Valid" }],
    });

    const foreignOrder = await mutateWorkflow(request(`/api/v1/operations/service-orders/${orderId}/workflow`, { action: "quality_check", passed: true }), context);
    expect(foreignOrder.status).toBe(403);
    await expect(foreignOrder.json()).resolves.toMatchObject({ error: { code: "SERVICE_ORDER_NOT_ASSIGNED" } });

    mocks.query.mockReset().mockResolvedValueOnce({
      rows: [{ id: orderId, status: "paid", customer_id: "customer-id", assigned_mechanic_id: mechanic.id, approved_at: "2026-09-28T00:00:00Z", diagnosis: "Valid" }],
    });
    const handover = await mutateWorkflow(request(`/api/v1/operations/service-orders/${orderId}/workflow`, { action: "handover", recipientName: "Pelanggan" }), context);
    expect(handover.status).toBe(403);
    await expect(handover.json()).resolves.toMatchObject({ error: { code: "HANDOVER_FORBIDDEN" } });
  });

  it("[P0] consumes a reserved part once and returns idempotent replay", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "in_progress", approvedAt: "2026-09-28T00:00:00Z", jobsOpen: 0, partsUnconsumed: 1 }] });
    mocks.query.mockResolvedValueOnce({ rows: [{ warehouse_id: warehouseId, product_id: productId, quantity: "2", unit_cost: "7000", consumed_at: null }] });
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const consumed = await mutateDetails(detailRequest({ action: "consume_part", partId, idempotencyKey: "consume-part-test" }), context);
    expect(consumed.status).toBe(200);
    expect(mocks.query.mock.calls[2][0]).toContain("stock_movements");
    expect(mocks.query.mock.calls[2][1]).toEqual([warehouseId, productId, -2, "7000", orderId, "consume-part-test", user.id]);

    mocks.query.mockReset().mockResolvedValueOnce({ rows: [{ status: "in_progress", approvedAt: "2026-09-28T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] }).mockResolvedValueOnce({ rows: [{ warehouse_id: warehouseId, product_id: productId, quantity: "2", unit_cost: "7000", consumed_at: "2026-09-28T00:00:00Z" }] });
    const replay = await mutateDetails(detailRequest({ action: "consume_part", partId, idempotencyKey: "consume-part-replay" }), context);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ data: { partId, alreadyConsumed: true } });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("[P1] rejects reservation when available stock excludes existing reservations", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "in_progress", approvedAt: "2026-09-28T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] });
    mocks.query.mockResolvedValueOnce({ rows: [{ quantity: "5", reserved_quantity: "4" }] });
    const response = await mutateDetails(detailRequest({ action: "reserve_part", productId, warehouseId, quantity: 2, unitPrice: 10000, unitCost: 7000 }), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INSUFFICIENT_AVAILABLE_STOCK" } });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("[P1] upserts quality check using service.complete permission", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "in_progress", approvedAt: "2026-09-28T00:00:00Z", jobsOpen: 0, partsUnconsumed: 0 }] });
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "qc-id", passed: true }] });
    const response = await mutateDetails(detailRequest({ action: "quality_check", passed: true, notes: "Rem dan lampu lulus" }), context);
    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.complete");
    expect(mocks.query.mock.calls[1][0]).toContain("ON CONFLICT(service_order_id) DO UPDATE");
  });

  it("[P0] blocks handover when an invoice is only partially paid", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: orderId, status: "invoiced", customer_id: "customer-id", assigned_mechanic_id: null, approved_at: "2026-09-28T00:00:00Z", diagnosis: "Valid" }] })
      .mockResolvedValueOnce({ rows: [{ jobs_open: "0", parts_unconsumed: "0", qc_passed: true, invoice_id: "invoice-id", invoice_status: "posted", total: "100000", paid: "40000" }] });

    const response = await mutateWorkflow(
      request(`/api/v1/operations/service-orders/${orderId}/workflow`, { action: "handover", recipientName: "Pelanggan Test", notes: "Belum lunas" }),
      context,
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(409);
    expect(payload).toMatchObject({ error: { code: "HANDOVER_NOT_READY" } });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][0]).toContain("sum(p.amount)");
  });
});
