import { describe, expect, it } from "vitest";

const enabled = process.env.SERVICE_RECEPTION_E2E_ENABLED === "true";
const baseUrl = process.env.SERVICE_RECEPTION_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:7780";
const email = process.env.SERVICE_RECEPTION_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.SERVICE_RECEPTION_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
const prefix = "/api/v1/operations/service-reception";

interface Envelope<T> {
  data: T;
  error: { code: string; message: string; fields?: Record<string, string[]> } | null;
}

async function login() {
  if (!password) throw new Error("SERVICE_RECEPTION_PASSWORD atau BOOTSTRAP_ADMIN_PASSWORD wajib diisi");
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  expect(cookie).not.toBe("");
  return cookie;
}

async function request<T>(cookie: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${prefix}${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin: baseUrl, cookie, ...init.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Envelope<T> : null;
  return { response, body };
}

function orderPayload(input: { customerId: string; vehicleId: string; odometer: number; idempotencyKey: string; reason?: string }) {
  return {
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    serviceType: "routine",
    complaint: "Pemeriksaan berkala service reception",
    odometer: input.odometer,
    odometerCorrectionReason: input.reason ?? null,
    checklist: { fuelLevel: 50, physicalCondition: "Kondisi bodi normal", belongings: ["Helm"], notes: "Acceptance test" },
    idempotencyKey: input.idempotencyKey,
  };
}

const suite = enabled ? describe : describe.skip;

suite("Service Reception route integration", () => {
  it("searches customer context and rejects duplicate phone and canonical plate", async () => {
    const cookie = await login();
    const suffix = Date.now().toString(36).toUpperCase();
    const phone = `0819${Date.now().toString().slice(-8)}`;
    const plateNumber = `REC-${suffix.slice(-6)}`;

    const customer = await request<{ id: string }>(cookie, "/customers", { method: "POST", body: JSON.stringify({ name: `Reception ${suffix}`, phone }) });
    expect(customer.response.status).toBe(200);

    const duplicateCustomer = await request<never>(cookie, "/customers", { method: "POST", body: JSON.stringify({ name: `Duplicate ${suffix}`, phone }) });
    expect(duplicateCustomer.response.status).toBe(409);
    expect(duplicateCustomer.body?.error?.code).toBe("CUSTOMER_PHONE_EXISTS");

    const vehicle = await request<{ id: string; odometer: number }>(cookie, "/vehicles", { method: "POST", body: JSON.stringify({ customerId: customer.body?.data.id, plateNumber, odometer: 25000 }) });
    expect(vehicle.response.status).toBe(200);

    const duplicateVehicle = await request<never>(cookie, "/vehicles", { method: "POST", body: JSON.stringify({ customerId: customer.body?.data.id, plateNumber: plateNumber.toLowerCase().replace("-", " "), odometer: 25000 }) });
    expect(duplicateVehicle.response.status).toBe(409);
    expect(duplicateVehicle.body?.error?.code).toBe("VEHICLE_PLATE_EXISTS");

    const search = await request<Array<{ id: string; vehicles: Array<{ id: string }> }>>(cookie, `/search?query=${encodeURIComponent(plateNumber.replace("-", ""))}`);
    expect(search.response.status).toBe(200);
    expect(search.body?.data.some((item) => item.id === customer.body?.data.id && item.vehicles.some((itemVehicle) => itemVehicle.id === vehicle.body?.data.id))).toBe(true);

    const context = await request<{ customer: { id: string }; vehicles: Array<{ id: string; odometer: number }> }>(cookie, `/customers/${customer.body?.data.id}/context`);
    expect(context.response.status).toBe(200);
    expect(context.body?.data.vehicles).toEqual(expect.arrayContaining([expect.objectContaining({ id: vehicle.body?.data.id, odometer: 25000 })]));
  });

  it("replays identical orders, rejects changed payload, and enforces ownership", async () => {
    const cookie = await login();
    const suffix = `${Date.now().toString(36).toUpperCase()}I`;
    const firstCustomer = await request<{ id: string }>(cookie, "/customers", { method: "POST", body: JSON.stringify({ name: `Owner A ${suffix}`, phone: `0821${Date.now().toString().slice(-8)}` }) });
    const secondCustomer = await request<{ id: string }>(cookie, "/customers", { method: "POST", body: JSON.stringify({ name: `Owner B ${suffix}`, phone: `0822${Date.now().toString().slice(-8)}` }) });
    const vehicle = await request<{ id: string }>(cookie, "/vehicles", { method: "POST", body: JSON.stringify({ customerId: firstCustomer.body?.data.id, plateNumber: `OWN${suffix.slice(-6)}`, odometer: 12000 }) });

    const payload = orderPayload({ customerId: firstCustomer.body?.data.id || "", vehicleId: vehicle.body?.data.id || "", odometer: 12100, idempotencyKey: `reception-order-${suffix}` });
    const order = await request<{ id: string; status: string }>(cookie, "/orders", { method: "POST", body: JSON.stringify(payload) });
    expect(order.response.status).toBe(200);
    expect(order.body?.data.status).toBe("open");

    const replay = await request<{ id: string }>(cookie, "/orders", { method: "POST", body: JSON.stringify(payload) });
    expect(replay.response.status).toBe(200);
    expect(replay.body?.data.id).toBe(order.body?.data.id);

    const conflict = await request<never>(cookie, "/orders", { method: "POST", body: JSON.stringify({ ...payload, complaint: "Payload berbeda" }) });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body?.error?.code).toBe("IDEMPOTENCY_CONFLICT");

    const ownership = await request<never>(cookie, "/orders", { method: "POST", body: JSON.stringify(orderPayload({ customerId: secondCustomer.body?.data.id || "", vehicleId: vehicle.body?.data.id || "", odometer: 12200, idempotencyKey: `reception-owner-${suffix}` })) });
    expect(ownership.response.status).toBe(404);
    expect(ownership.body?.error?.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("requires correction reason for odometer regression and accepts audited correction", async () => {
    const cookie = await login();
    const suffix = `${Date.now().toString(36).toUpperCase()}O`;
    const customer = await request<{ id: string }>(cookie, "/customers", { method: "POST", body: JSON.stringify({ name: `Odometer ${suffix}`, phone: `0823${Date.now().toString().slice(-8)}` }) });
    const vehicle = await request<{ id: string }>(cookie, "/vehicles", { method: "POST", body: JSON.stringify({ customerId: customer.body?.data.id, plateNumber: `ODO${suffix.slice(-6)}`, odometer: 30000 }) });

    const withoutReason = await request<never>(cookie, "/orders", { method: "POST", body: JSON.stringify(orderPayload({ customerId: customer.body?.data.id || "", vehicleId: vehicle.body?.data.id || "", odometer: 29900, idempotencyKey: `reception-odometer-reject-${suffix}` })) });
    expect(withoutReason.response.status).toBe(422);
    expect(withoutReason.body?.error?.code).toBe("ODOMETER_CORRECTION_REASON_REQUIRED");

    const corrected = await request<{ id: string; odometer: number }>(cookie, "/orders", { method: "POST", body: JSON.stringify(orderPayload({ customerId: customer.body?.data.id || "", vehicleId: vehicle.body?.data.id || "", odometer: 29900, idempotencyKey: `reception-odometer-accept-${suffix}`, reason: "Panel meter diganti" })) });
    expect(corrected.response.status).toBe(200);
    expect(corrected.body?.data.odometer).toBe(29900);
  });

  it("rolls back nested customer when nested vehicle creation fails", async () => {
    const cookie = await login();
    const suffix = `${Date.now().toString(36).toUpperCase()}R`;
    const existing = await request<{ id: string }>(cookie, "/customers", { method: "POST", body: JSON.stringify({ name: `Existing ${suffix}`, phone: `0824${Date.now().toString().slice(-8)}` }) });
    const plateNumber = `RBK${suffix.slice(-6)}`;
    await request(cookie, "/vehicles", { method: "POST", body: JSON.stringify({ customerId: existing.body?.data.id, plateNumber, odometer: 1000 }) });

    const rolledBackPhone = `0825${Date.now().toString().slice(-8)}`;
    const failed = await request<never>(cookie, "/orders", {
      method: "POST",
      body: JSON.stringify({
        customer: { name: `Rolled Back ${suffix}`, phone: rolledBackPhone },
        vehicle: { plateNumber },
        serviceType: "general",
        complaint: "Rollback nested reception",
        odometer: 1100,
        checklist: { belongings: [] },
        idempotencyKey: `reception-rollback-${suffix}`,
      }),
    });
    expect(failed.response.status).toBe(409);
    expect(failed.body?.error?.code).toBe("VEHICLE_PLATE_EXISTS");

    const search = await request<Array<{ phone: string | null }>>(cookie, `/search?query=${encodeURIComponent(rolledBackPhone)}`);
    expect(search.response.status).toBe(200);
    expect(search.body?.data).toEqual([]);
  });
});
