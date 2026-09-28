import { describe, expect, it } from "vitest";

const enabled = process.env.POS_OPEN_BILL_E2E_ENABLED === "true";
const baseUrl = process.env.POS_OPEN_BILL_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:7780";
const email = process.env.POS_OPEN_BILL_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.POS_OPEN_BILL_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
const prefix = "/api/v1/pos";

interface Envelope<T> {
  data: T;
  error: { code: string; message: string } | null;
}

type Product = { id: string; availableQuantity: string | number; imageUrl?: string | null };
type Service = { id: string; name: string; fixedPrice: string | number; isActive?: boolean };
type OpenBill = { id: string; customerId: string; status: "open" | "converted" | "cancelled"; items: Array<{ productId?: string; serviceId?: string; quantity: string | number }> };

async function login() {
  if (!password) throw new Error("POS_OPEN_BILL_PASSWORD atau BOOTSTRAP_ADMIN_PASSWORD wajib diisi");
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

const suite = enabled ? describe : describe.skip;

suite("POS Open Bill contract", () => {
  it("returns service catalog and product image URLs without exposing cost", async () => {
    const cookie = await login();
    const services = await request<Service[]>(cookie, "/services");
    expect(services.response.status).toBe(200);
    expect(services.body?.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.any(String), name: expect.any(String), fixedPrice: expect.anything() }),
    ]));

    const registers = await request<Array<{ id: string }>>(cookie, "/registers");
    const products = await request<Product[]>(cookie, `/products?registerId=${registers.body?.data[0]?.id}`);
    expect(products.response.status).toBe(200);
    expect(JSON.stringify(products.body?.data)).not.toMatch(/"hpp"|"unitCost"|"unit_cost"/i);
    expect(products.body?.data?.every((item) => "imageUrl" in item)).toBe(true);
  });

  it("persists one mixed open bill per customer and replaces its item set", async () => {
    const cookie = await login();
    const suffix = Date.now().toString(36);
    const customer = await fetch(`${baseUrl}/api/v1/operations/customers`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, cookie },
      body: JSON.stringify({ name: `Open Bill ${suffix}`, phone: `0877${Date.now().toString().slice(-8)}` }),
    });
    const customerId = ((await customer.json()) as Envelope<{ id: string }>).data.id;
    const registers = await request<Array<{ id: string }>>(cookie, "/registers");
    const registerId = registers.body?.data[0]?.id;
    const services = await request<Service[]>(cookie, "/services");
    const products = await request<Product[]>(cookie, `/products?registerId=${registerId}`);
    const product = products.body?.data.find((item) => Number(item.availableQuantity) > 0);
    const service = services.body?.data[0];
    expect(registerId && product && service).toBeTruthy();

    const payload = { customerId, registerId, items: [
      { productId: product?.id, quantity: "1", discount: "0" },
      { serviceId: service?.id, quantity: "1", discount: "0" },
    ] };
    const saved = await request<OpenBill>(cookie, "/open-bills", { method: "PUT", body: JSON.stringify(payload) });
    expect(saved.response.status).toBe(200);
    expect(saved.body?.data).toMatchObject({ customerId, status: "open" });
    expect(saved.body?.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: product?.id }),
      expect.objectContaining({ serviceId: service?.id }),
    ]));

    const restored = await request<OpenBill | null>(cookie, `/open-bills?customerId=${customerId}`);
    expect(restored.response.status).toBe(200);
    expect(restored.body?.data?.id).toBe(saved.body?.data.id);

    const replaced = await request<OpenBill>(cookie, "/open-bills", { method: "PUT", body: JSON.stringify({ ...payload, items: [payload.items[1]] }) });
    expect(replaced.response.status).toBe(200);
    expect(replaced.body?.data.id).toBe(saved.body?.data.id);
    expect(replaced.body?.data.items).toHaveLength(1);
    const deleted = await request<null>(cookie, `/open-bills/${saved.body?.data.id}`, { method: "DELETE" });
    expect(deleted.response.status).toBe(200);
    const missing = await request<null>(cookie, `/open-bills?customerId=${customerId}`);
    expect(missing.response.status).toBe(200);
    expect(missing.body?.data).toBeNull();
  });

  it("converts mixed open bill atomically and decrements product stock only", async () => {
    const cookie = await login();
    const suffix = Date.now().toString(36);
    const customer = await fetch(`${baseUrl}/api/v1/operations/customers`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, cookie },
      body: JSON.stringify({ name: `Checkout Bill ${suffix}`, phone: `0878${Date.now().toString().slice(-8)}` }),
    });
    const customerId = ((await customer.json()) as Envelope<{ id: string }>).data.id;
    const registers = await request<Array<{ id: string }>>(cookie, "/registers");
    const registerId = registers.body?.data[0]?.id;
    const services = await request<Service[]>(cookie, "/services");
    const beforeProducts = await request<Product[]>(cookie, `/products?registerId=${registerId}`);
    const product = beforeProducts.body?.data.find((item) => Number(item.availableQuantity) > 1);
    const service = services.body?.data[0];
    expect(registerId && product && service).toBeTruthy();

    const created = await request<OpenBill>(cookie, "/open-bills", { method: "PUT", body: JSON.stringify({ customerId, registerId, items: [
      { productId: product?.id, quantity: "1", discount: "0" },
      { serviceId: service?.id, quantity: "1", discount: "0" },
    ] }) });
    expect(created.response.status).toBe(200);
    const before = Number(product?.availableQuantity);
    const saleItems = [
      { productId: product!.id, quantity: "1", discount: "0" },
      { serviceId: service!.id, quantity: "1", discount: "0" },
    ];
    const afterSaveProducts = await request<Product[]>(cookie, `/products?registerId=${registerId}`);
    expect(Number(afterSaveProducts.body?.data.find((item) => item.id === product?.id)?.availableQuantity)).toBe(before);
    const otherCustomer = await fetch(`${baseUrl}/api/v1/operations/customers`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, cookie },
      body: JSON.stringify({ name: `Wrong Customer ${suffix}`, phone: `0879${Date.now().toString().slice(-8)}` }),
    });
    const otherCustomerId = ((await otherCustomer.json()) as Envelope<{ id: string }>).data.id;
    const wrongCustomerCheckout = await request<never>(cookie, "/checkout", { method: "POST", body: JSON.stringify({ registerId, customerId: otherCustomerId, openBillId: created.body?.data.id, items: saleItems, payments: [{ method: "cash", amount: "1000000.00", idempotencyKey: `wrong-customer-payment-${suffix}` }], tax: "0", idempotencyKey: `wrong-customer-checkout-${suffix}` }) });
    expect(wrongCustomerCheckout.response.status).toBe(404);
    expect(wrongCustomerCheckout.body?.error?.code).toBe("OPEN_BILL_NOT_FOUND");
    const checkoutPayload = { registerId, customerId, openBillId: created.body?.data.id, items: saleItems, payments: [{ method: "cash", amount: "1000000.00", idempotencyKey: `open-bill-payment-${suffix}` }], tax: "0", idempotencyKey: `open-bill-checkout-${suffix}` };
    const completed = await request<{ id: string }>(cookie, "/checkout", { method: "POST", body: JSON.stringify(checkoutPayload) });
    expect(completed.response.status).toBe(200);
    const replay = await request<{ id: string }>(cookie, "/checkout", { method: "POST", body: JSON.stringify(checkoutPayload) });
    expect(replay.response.status).toBe(200);
    expect(replay.body?.data.id).toBe(completed.body?.data.id);

    const afterProducts = await request<Product[]>(cookie, `/products?registerId=${registerId}`);
    const after = afterProducts.body?.data.find((item) => item.id === product?.id);
    expect(Number(after?.availableQuantity)).toBe(before - 1);
    const converted = await request<OpenBill | null>(cookie, `/open-bills?customerId=${customerId}`);
    expect(converted.body?.data).toBeNull();
  });
});
