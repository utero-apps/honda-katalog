import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/http";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), transaction: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: mocks.transaction }));

import { GET as getWorkflow } from "@/app/api/v1/operations/service-orders/[id]/workflow/route";

const orderId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: orderId }) };

describe("access to service order print data", () => {
  beforeEach(() => {
    mocks.requirePermission.mockReset();
    mocks.transaction.mockReset();
  });

  it("denies anonymous readers without touching workflow data", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new ApiError(401, "UNAUTHENTICATED", "Silakan login terlebih dahulu"));

    const response = await getWorkflow(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/workflow`) as never, context);

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.read");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies readers without service.read before any SQL is executed", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Anda tidak memiliki izin untuk tindakan ini"));

    const response = await getWorkflow(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/workflow`) as never, context);

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses actor-scoped transaction for authorized print reads", async () => {
    const actor = { id: "22222222-2222-4222-8222-222222222222", role: "cashier" };
    mocks.requirePermission.mockResolvedValueOnce(actor);
    mocks.transaction.mockResolvedValueOnce({ id: orderId, orderNumber: "SO-001", status: "open" });

    const response = await getWorkflow(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/workflow`) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.id, role: actor.role, requestId: expect.any(String) }),
      expect.any(Function),
    );
  });

  it("rejects invalid service order IDs before SQL", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ id: orderId, role: "admin" });

    const response = await getWorkflow(
      new Request("http://localhost/api/v1/operations/service-orders/not-an-id/workflow") as never,
      { params: Promise.resolve({ id: "not-an-id" }) },
    );

    expect(response.status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
