import process from "node:process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:37800";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");
let cookie = "";

const anonymous = await fetch(`${baseUrl}/api/v1/catalog/products`);
if (anonymous.status !== 401) throw new Error("Anonymous access tidak ditolak");
const crossOriginLogin = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.invalid" }, body: JSON.stringify({ email, password }) });
if (crossOriginLogin.status !== 403) throw new Error("Cross-origin mutation tidak ditolak");

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
const vendor = (await request("/api/v1/business/vendors", { method: "POST", body: JSON.stringify({ code: `V-${suffix}`, name: "Vendor E2E" }) })).body.data;
const purchaseOrder = (await request("/api/v1/business/purchase-orders", { method: "POST", body: JSON.stringify({ orderNumber: `PO-${suffix}`, vendorId: vendor.id, items: [{ productId: product.id, quantity: 5, unitPrice: 7000 }] }) })).body.data;
await request(`/api/v1/business/purchase-orders/${purchaseOrder.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "submitted" }) });
await request(`/api/v1/business/purchase-orders/${purchaseOrder.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
const warehouses = (await request("/api/v1/operations/warehouses")).body.data;
const receiptPayload = { receiptNumber: `GR-${suffix}`, purchaseOrderId: purchaseOrder.id, warehouseId: warehouses[0].id, idempotencyKey: `receipt-${suffix}`, items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, quantity: 5, unitCost: 7000 }] };
const receipt = (await request("/api/v1/business/receipts", { method: "POST", body: JSON.stringify(receiptPayload) })).body.data;
const replayedReceipt = (await request("/api/v1/business/receipts", { method: "POST", body: JSON.stringify(receiptPayload) })).body.data;
if (receipt.id !== replayedReceipt.id) throw new Error("Idempotency receipt gagal");
const reservedPart = (await request(`/api/v1/operations/service-orders/${order.id}/details`, { method: "POST", body: JSON.stringify({ action: "reserve_part", warehouseId: warehouses[0].id, productId: product.id, quantity: 1, unitPrice: 10000, unitCost: 7000 }) })).body.data;
await request(`/api/v1/operations/service-orders/${order.id}/details`, { method: "POST", body: JSON.stringify({ action: "consume_part", partId: reservedPart.id, idempotencyKey: `service-usage-${suffix}` }) });
await request("/api/v1/business/customer-invoices", { method: "POST", body: JSON.stringify({ invoiceNumber: `CI-${suffix}`, serviceOrderId: order.id, discount: 0, tax: 0 }) });
const vendorInvoice = (await request("/api/v1/business/vendor-invoices", { method: "POST", body: JSON.stringify({ invoiceNumber: `VI-${suffix}`, vendorId: vendor.id, purchaseOrderId: purchaseOrder.id, total: 35000, issuedAt: "2026-09-27" }) })).body.data;
await request("/api/v1/business/payments", { method: "POST", body: JSON.stringify({ paymentNumber: `PAY-${suffix}`, direction: "outgoing", vendorInvoiceId: vendorInvoice.id, amount: 35000, method: "transfer", idempotencyKey: `payment-${suffix}` }) });
await request("/api/v1/intelligence/follow-ups", { method: "POST", body: JSON.stringify({ customerId: customer.id, serviceOrderId: order.id, dueAt: "2026-10-01T08:00:00.000Z", channel: "whatsapp" }) });
await request("/api/v1/intelligence/reminders", { method: "POST", body: JSON.stringify({ customerId: customer.id, vehicleId: vehicle.id, dueAt: "2026-10-01T08:00:00.000Z" }) });
const dashboard = await request("/api/v1/intelligence/dashboard");
const metrics = await request("/api/v1/intelligence/metrics");
const exported = await fetch(`${baseUrl}/api/v1/intelligence/export`, { headers: { cookie } });
if (!dashboard.body.data || !metrics.body.data || !exported.ok || metrics.body.data.monthlyCogs < 7000 || metrics.body.data.monthlyGrossProfit <= 0) throw new Error("Reporting E2E gagal");
const audit = await request("/api/v1/audit");
if (!audit.body.data.some((event) => event.entityId === product.id)) throw new Error("Audit product tidak ditemukan");
await request("/api/v1/auth/logout", { method: "POST", body: "{}" });
const revokedSession = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie } });
if (revokedSession.status !== 401) throw new Error("Session revoke gagal");
console.log(JSON.stringify({ verified: true, productId: product.id, customerId: customer.id, serviceOrderId: order.id }));
