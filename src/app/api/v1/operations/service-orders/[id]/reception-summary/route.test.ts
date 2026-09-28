import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));

import { GET } from "./route";

const orderId = "11111111-1111-4111-8111-111111111111";
const user = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };
const context = { params: Promise.resolve({ id: orderId }) };

describe("service order reception summary route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue(user);
  });

  it("returns intake checklist, immutable odometer record, and correction reason", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ serviceOrderId: orderId, orderNumber: "SO-001", customerId: "customer-id", customerName: "Budi", vehicleId: "vehicle-id", plateNumber: "B 1234 ABC", model: "Vario", receptionId: "reception-id", serviceType: "routine", fuelLevel: "50", physicalCondition: "Baret kanan", belongings: ["Helm"], notes: "Tunggu pelanggan", recommendations: [{ title: "Ganti oli" }], receivedById: user.id, receivedByName: "Admin", receivedAt: "2026-09-28T08:00:00Z", odometer: "12000", odometerCorrectionReason: "Panel sebelumnya salah input", odometerRecordedAt: "2026-09-28T08:00:00Z" }] });

    const response = await GET(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/reception-summary`) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), expect.any(String), "service.read");
    expect(mocks.query.mock.calls[0][0]).toContain("app.service_receptions");
    expect(mocks.query.mock.calls[0][0]).toContain("app.vehicle_odometer_logs");
    expect(mocks.query.mock.calls[0][1]).toEqual([orderId]);
    await expect(response.json()).resolves.toMatchObject({ data: { reception: { fuelLevel: 50, odometer: 12000, odometerCorrectionReason: "Panel sebelumnya salah input" } } });
  });

  it("returns a null reception for legacy service orders", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ serviceOrderId: orderId, orderNumber: "SO-LEGACY", customerId: "customer-id", customerName: "Budi", vehicleId: "vehicle-id", plateNumber: "B 1234 ABC", model: null, receptionId: null, serviceType: null, fuelLevel: null, physicalCondition: null, belongings: null, notes: null, recommendations: null, receivedById: null, receivedByName: null, receivedAt: null, odometer: null, odometerCorrectionReason: null, odometerRecordedAt: null }] });
    const response = await GET(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/reception-summary`) as never, context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { reception: null } });
  });

  it("returns 404 for a missing service order", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request(`http://localhost/api/v1/operations/service-orders/${orderId}/reception-summary`) as never, context);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_ORDER_NOT_FOUND" } });
  });
});
