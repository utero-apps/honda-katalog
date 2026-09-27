import process from "node:process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:37800";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");
let cookie = "";

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", origin: baseUrl, ...(cookie ? { cookie } : {}), ...init.headers } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path}: ${response.status} ${body?.error?.message || text}`);
  return { response, body };
}

const health = await request("/api/health");
if (health.body.data.status !== "ok") throw new Error("Health gagal");
const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
if (!cookie) throw new Error("Session cookie tidak diterbitkan");
const suffix = Date.now().toString(36).toUpperCase();
const product = (await request("/api/v1/catalog/products", { method: "POST", body: JSON.stringify({ partCode: `E2E-${suffix}`, name: "Produk E2E", het: 10000, minimumStock: 2 }) })).body.data;
const injectionSearch = await request(`/api/v1/catalog/products?query=${encodeURIComponent("' OR 1=1 --")}`);
if (!Array.isArray(injectionSearch.body.data)) throw new Error("Search envelope invalid");
const customer = (await request("/api/v1/operations/customers", { method: "POST", body: JSON.stringify({ name: "Pelanggan E2E", phone: `08${Date.now().toString().slice(-10)}` }) })).body.data;
const models = (await request("/api/v1/catalog/models")).body.data;
const vehicle = (await request("/api/v1/operations/vehicles", { method: "POST", body: JSON.stringify({ customerId: customer.id, vehicleModelId: models[0]?.id || null, plateNumber: `E2E${suffix.slice(-5)}`, odometer: 1200 }) })).body.data;
const order = (await request("/api/v1/operations/service-orders", { method: "POST", body: JSON.stringify({ orderNumber: `SO-${suffix}`, customerId: customer.id, vehicleId: vehicle.id, complaint: "Pengujian workflow E2E" }) })).body.data;
await request(`/api/v1/operations/service-orders/${order.id}/details`, { method: "POST", body: JSON.stringify({ action: "job", name: "Servis E2E", price: 50000 }) });
await request(`/api/v1/operations/service-orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) });
await request(`/api/v1/operations/service-orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "quality_check" }) });
const profile = await request(`/api/v1/operations/customers/${customer.id}/profile`);
if (profile.body.data.orders[0]?.id !== order.id) throw new Error("Service history tidak terhubung");
const audit = await request("/api/v1/audit");
if (!audit.body.data.some((event) => event.entityId === product.id)) throw new Error("Audit product tidak ditemukan");
console.log(JSON.stringify({ verified: true, productId: product.id, customerId: customer.id, serviceOrderId: order.id }));
