import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/http";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: mocks.transaction }));

import { GET, POST, PUT } from "./route";
import { GET as GET_ASSET } from "./[assetId]/route";

const orderId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const user = { id: "33333333-3333-4333-8333-333333333333", role: "mechanic" };
const context = { params: Promise.resolve({ id: orderId }) };

describe("handover asset route security", () => {
  beforeEach(() => {
    mocks.requirePermission.mockReset().mockResolvedValue(user);
    mocks.transaction.mockReset();
  });

  it("uses service.read and actor-scoped RLS context for handover print data", async () => {
    mocks.transaction.mockResolvedValueOnce({ serviceOrderId: orderId, assets: [], readiness: { ready: false } });

    const response = await GET(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`) as never, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.read");
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, role: user.role, requestId: expect.any(String) }),
      expect.any(Function),
    );
  });

  it("requires service.create for checklist and upload mutations", async () => {
    mocks.transaction.mockResolvedValue({ ok: true });
    const checklist = new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`, {
      method: "PUT",
      headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost" },
      body: JSON.stringify({ vehicleChecked: true, belongingsReturned: true, keysReturned: true, workExplained: true }),
    });

    const response = await PUT(checklist as never, context);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.create");
  });

  it("rejects an unauthorized upload without reading multipart data or SQL", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Akses ditolak"));
    const request = new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`, {
      method: "POST",
      headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
      body: "{}",
    });

    const response = await POST(request as never, context);

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.create");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("passes a validated multipart photo through an actor-scoped transaction", async () => {
    mocks.transaction.mockResolvedValueOnce({ id: assetId, kind: "final_photo" });
    const imageBytes = new Uint8Array(32);
    imageBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.set("kind", "final_photo");
    form.set("image", new File([imageBytes], "motor.png", { type: "image/png" }));

    const response = await POST(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`, {
      method: "POST",
      headers: { host: "localhost", origin: "http://localhost" },
      body: form,
    }) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, role: user.role, requestId: expect.any(String) }),
      expect.any(Function),
    );
  });

  it("rejects cross-origin uploads before permission and parsing", async () => {
    const request = new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`, {
      method: "POST",
      headers: { host: "localhost", origin: "https://attacker.invalid", "content-type": "multipart/form-data; boundary=test" },
      body: "--test--",
    });

    const response = await POST(request as never, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ORIGIN_DENIED" } });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects unsupported content type and oversized requests before SQL", async () => {
    const jsonResponse = await POST(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`, {
      method: "POST",
      headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
      body: "{}",
    }) as never, context);
    expect(jsonResponse.status).toBe(415);

    const oversizedResponse = await POST(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets`, {
      method: "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(3 * 1024 * 1024 + 64 * 1024 + 1),
      },
      body: "--test--",
    }) as never, context);
    expect(oversizedResponse.status).toBe(413);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("serves stored assets only through service.read with hardened headers", async () => {
    mocks.transaction.mockResolvedValueOnce({
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
      sha256: "abc123",
    });

    const response = await GET_ASSET(
      new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/handover-assets/${assetId}`) as never,
      { params: Promise.resolve({ id: orderId, assetId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.read");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
