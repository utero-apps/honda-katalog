import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:37800";
const ownerEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");

const client = new Client({
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "honda_workshop",
  user: process.env.POSTGRES_USER || "honda_owner",
  password: process.env.POSTGRES_PASSWORD,
});
const receptionSecurityCustomerIds = [];
const receptionSecurityVehicleIds = [];
const receptionSecurityOrderIds = [];

async function login(email) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error(`Login ${email} gagal: ${response.status}`);
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) throw new Error("Cookie session tidak diterbitkan");
  return cookie;
}

await client.connect();
try {
  const suffix = Date.now().toString(36);
  const cashierEmail = `security-${suffix}@honda.local`;
  const mechanicEmail = `security-mechanic-${suffix}@honda.local`;
  const warehouseEmail = `security-warehouse-${suffix}@honda.local`;
  await client.query("INSERT INTO app.users(email,display_name,password_hash,role) SELECT $1,'Security Cashier',password_hash,'cashier' FROM app.users WHERE email=$2", [cashierEmail, ownerEmail]);
  await client.query("INSERT INTO app.users(email,display_name,password_hash,role) SELECT $1,'Security Mechanic',password_hash,'mechanic' FROM app.users WHERE email=$2", [mechanicEmail, ownerEmail]);
  await client.query("INSERT INTO app.users(email,display_name,password_hash,role) SELECT $1,'Security Warehouse',password_hash,'warehouse' FROM app.users WHERE email=$2", [warehouseEmail, ownerEmail]);

  const ownerCookieA = await login(ownerEmail);
  const ownerCookieB = await login(ownerEmail);
  if (ownerCookieA === ownerCookieB) throw new Error("Token session tidak unik");

  const cashierCookie = await login(cashierEmail);
  const mechanicCookie = await login(mechanicEmail);
  const warehouseCookie = await login(warehouseEmail);
  const escalation = await fetch(`${baseUrl}/api/v1/catalog/products`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: cashierCookie }, body: JSON.stringify({ partCode: `SEC-${suffix}`, name: "Escalation Attempt", het: 1 }) });
  if (escalation.status !== 403) throw new Error(`Privilege escalation tidak ditolak: ${escalation.status}`);

  const auditAccess = await fetch(`${baseUrl}/api/v1/audit`, { headers: { cookie: cashierCookie } });
  if (auditAccess.status !== 403) throw new Error(`Audit role boundary gagal: ${auditAccess.status}`);

  const unknownId = crypto.randomUUID();
  const idor = await fetch(`${baseUrl}/api/v1/operations/service-orders/${unknownId}/details`, { headers: { cookie: cashierCookie } });
  if (idor.status !== 404) throw new Error(`Unknown resource tidak aman: ${idor.status}`);
  const idorBody = await idor.json();
  if (idorBody.error?.code !== "SERVICE_ORDER_NOT_FOUND") throw new Error("Unknown resource membocorkan detail internal");

  const anonymousPos = await fetch(`${baseUrl}/api/v1/pos/products`);
  if (anonymousPos.status !== 401) throw new Error(`POS anonymous access tidak ditolak: ${anonymousPos.status}`);
  const posProducts = await fetch(`${baseUrl}/api/v1/pos/products`, { headers: { cookie: cashierCookie } });
  if (!posProducts.ok || /"hpp"|"unitCost"|"unit_cost"/i.test(await posProducts.text())) throw new Error("POS product membocorkan HPP atau tidak dapat dibaca cashier");
  const crossOriginCheckout = await fetch(`${baseUrl}/api/v1/pos/checkout`, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.invalid", cookie: cashierCookie }, body: "{}" });
  if (crossOriginCheckout.status !== 403) throw new Error(`Cross-origin POS checkout tidak ditolak: ${crossOriginCheckout.status}`);
  const mechanicCheckout = await fetch(`${baseUrl}/api/v1/pos/checkout`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: mechanicCookie }, body: "{}" });
  if (mechanicCheckout.status !== 403) throw new Error(`Mechanic dapat checkout POS: ${mechanicCheckout.status}`);
  const cashierVoid = await fetch(`${baseUrl}/api/v1/pos/sales/${crypto.randomUUID()}/void`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: cashierCookie }, body: JSON.stringify({ reason: "Privilege test" }) });
  if (cashierVoid.status !== 403) throw new Error(`Cashier dapat void POS: ${cashierVoid.status}`);

  if (process.env.SERVICE_RECEPTION_SECURITY_ENABLED === "true") {
    const receptionBase = "/api/v1/operations/service-reception";
    const anonymousReception = await fetch(`${baseUrl}${receptionBase}/search?query=security`);
    if (anonymousReception.status !== 401) throw new Error(`Reception anonymous access tidak ditolak: ${anonymousReception.status}`);

    const crossOriginCustomer = await fetch(`${baseUrl}${receptionBase}/customers`, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.invalid", cookie: cashierCookie }, body: "{}" });
    if (crossOriginCustomer.status !== 403) throw new Error(`Cross-origin reception tidak ditolak: ${crossOriginCustomer.status}`);

    const mechanicOrder = await fetch(`${baseUrl}${receptionBase}/orders`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: mechanicCookie }, body: "{}" });
    if (mechanicOrder.status !== 403) throw new Error(`Mechanic dapat membuat order reception: ${mechanicOrder.status}`);

    const warehouseOrder = await fetch(`${baseUrl}${receptionBase}/orders`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: warehouseCookie }, body: "{}" });
    if (warehouseOrder.status !== 403) throw new Error(`Warehouse dapat membuat order reception: ${warehouseOrder.status}`);

    const cashierOrderResponse = await fetch(`${baseUrl}${receptionBase}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, cookie: cashierCookie },
      body: JSON.stringify({
        customer: { name: `Security Reception ${suffix}`, phone: `0815${Date.now().toString().slice(-8)}` },
        vehicle: { plateNumber: `RLS${suffix.slice(-8)}` },
        serviceType: "general",
        complaint: "RLS route integration test",
        odometer: 1000,
        checklist: { belongings: [] },
        idempotencyKey: `reception-rls-${suffix}`,
      }),
    });
    if (!cashierOrderResponse.ok) throw new Error(`Cashier tidak dapat membuat reception: ${cashierOrderResponse.status}`);
    const cashierOrder = (await cashierOrderResponse.json()).data;
    receptionSecurityOrderIds.push(cashierOrder.id);
    receptionSecurityCustomerIds.push(cashierOrder.customerId);
    receptionSecurityVehicleIds.push(cashierOrder.vehicleId);
    const cashierRead = await fetch(`${baseUrl}${receptionBase}/orders/${cashierOrder.id}`, { headers: { cookie: cashierCookie } });
    if (!cashierRead.ok) throw new Error(`Cashier tidak dapat membaca reception sendiri: ${cashierRead.status}`);
    const warehouseRead = await fetch(`${baseUrl}${receptionBase}/orders/${cashierOrder.id}`, { headers: { cookie: warehouseCookie } });
    if (warehouseRead.status !== 403) throw new Error(`Warehouse dapat membaca reception: ${warehouseRead.status}`);

    const foreignCustomer = (await client.query("INSERT INTO app.customers(name,phone) VALUES($1,$2) RETURNING id", [`Security Foreign ${suffix}`, `0817${Date.now().toString().slice(-8)}`])).rows[0];
    const receivingCustomer = (await client.query("INSERT INTO app.customers(name,phone) VALUES($1,$2) RETURNING id", [`Security Receiver ${suffix}`, `0816${Date.now().toString().slice(-8)}`])).rows[0];
    receptionSecurityCustomerIds.push(foreignCustomer.id, receivingCustomer.id);
    const foreignVehicle = (await client.query("INSERT INTO app.customer_vehicles(customer_id,plate_number,odometer) VALUES($1,$2,10000) RETURNING id", [foreignCustomer.id, `SEC${suffix.slice(-8)}`])).rows[0];
    receptionSecurityVehicleIds.push(foreignVehicle.id);
    const ownershipAttempt = await fetch(`${baseUrl}${receptionBase}/orders`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: cashierCookie }, body: JSON.stringify({ customerId: receivingCustomer.id, vehicleId: foreignVehicle.id, serviceType: "general", complaint: "IDOR test", odometer: 10000, checklist: { belongings: [] }, idempotencyKey: `reception-idor-${suffix}` }) });
    if (ownershipAttempt.status !== 404 || (await ownershipAttempt.json()).error?.code !== "VEHICLE_NOT_FOUND") throw new Error("Ownership handling reception membocorkan kendaraan asing");
  }

  const token = ownerCookieA.split("=")[1];
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await client.query("UPDATE app.sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_hash=$1", [tokenHash]);
  const expired = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: ownerCookieA } });
  if (expired.status !== 401) throw new Error("Session expiry gagal");

  console.log(JSON.stringify({ verified: true, anonymous: true, escalation: true, idor: true, expiry: true, rotation: true, pos: true, reception: process.env.SERVICE_RECEPTION_SECURITY_ENABLED === "true" }));
} finally {
  await client.query("DELETE FROM app.sessions WHERE user_id IN (SELECT id FROM app.users WHERE email LIKE 'security-%@honda.local')");
  await client.query("UPDATE app.users SET is_active=false WHERE email LIKE 'security-%@honda.local'");
  await client.end();
}
