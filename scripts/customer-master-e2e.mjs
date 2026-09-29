import process from "node:process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:7780";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (process.env.E2E_ISOLATED !== "1") throw new Error("Customer master E2E wajib memakai database uji terisolasi dan E2E_ISOLATED=1");
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");

let cookie = "";
async function request(path, init = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { origin: baseUrl, ...(cookie ? { cookie } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null);
  if (response.status !== expected) throw new Error(`${init.method || "GET"} ${path}: expected ${expected}, got ${response.status} ${JSON.stringify(body?.error)}`);
  return body;
}

const login = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ email: process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local", password }) });
if (!login.ok) throw new Error("Login customer master E2E gagal");
cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const suffix = Date.now().toString().slice(-9);
const target = (await request("/api/v1/operations/customers", { method: "POST", body: JSON.stringify({ name: `Target ${suffix}`, phone: `08${suffix}` }) })).data;
const initialProfile = (await request(`/api/v1/operations/customers/${target.id}/profile`)).data;
if (initialProfile.customer.communicationConsent !== false) throw new Error("Pelanggan baru harus default opt-out komunikasi otomatis");
const duplicate = await request("/api/v1/operations/customers", { method: "POST", body: JSON.stringify({ name: `Duplikat ${suffix}`, phone: `628${suffix}` }) }, 409);
if (duplicate.error?.code !== "CUSTOMER_CONTACT_EXISTS") throw new Error("Normalisasi telepon tidak menolak duplikat");
await request(`/api/v1/operations/customers/${target.id}`, { method: "PATCH", body: JSON.stringify({ name: `Target Utama ${suffix}`, email: `TARGET-${suffix}@EXAMPLE.TEST`, communicationConsent: true, preferredChannel: "whatsapp" }) });

const owner = (await request("/api/v1/operations/customers", { method: "POST", body: JSON.stringify({ name: `Pemilik Lama ${suffix}`, phone: `087${suffix}` }) })).data;
const vehicle = (await request("/api/v1/operations/vehicles", { method: "POST", body: JSON.stringify({ customerId: owner.id, plateNumber: `TR${suffix.slice(-6)}`, year: 2024, odometer: 1200 }) })).data;
await request(`/api/v1/operations/vehicles/${vehicle.id}`, { method: "PATCH", body: JSON.stringify({ vin: `VIN${suffix}`, engineNumber: `ENG${suffix}` }) });
await request(`/api/v1/operations/vehicles/${vehicle.id}/transfer`, { method: "POST", body: JSON.stringify({ customerId: target.id, reason: "Motor dijual kepada pelanggan target" }) });

const source = (await request("/api/v1/operations/customers", { method: "POST", body: JSON.stringify({ name: `Sumber ${suffix}`, phone: `089${suffix}` }) })).data;
await request(`/api/v1/operations/customers/${source.id}`, { method: "PATCH", body: JSON.stringify({ communicationConsent: true, preferredChannel: "whatsapp" }) });
const sourceVehicle = (await request("/api/v1/operations/vehicles", { method: "POST", body: JSON.stringify({ customerId: source.id, plateNumber: `MG${suffix.slice(-6)}`, odometer: 50 }) })).data;
const sourceOrder = (await request("/api/v1/operations/service-orders", { method: "POST", body: JSON.stringify({ customerId: source.id, vehicleId: sourceVehicle.id, orderNumber: `SO-MERGE-${suffix}`, complaint: "Pemeriksaan data pelanggan" }) })).data;
const reminder = (await request("/api/v1/intelligence/reminders", { method: "POST", body: JSON.stringify({ customerId: source.id, vehicleId: sourceVehicle.id, dueAt: new Date(Date.now() + 86400000).toISOString(), odometerDue: 2000 }) })).data;
await request(`/api/v1/operations/customers/${target.id}/merge`, { method: "POST", body: JSON.stringify({ sourceCustomerId: source.id, reason: "Duplikat data pelanggan pengujian" }) });
await request(`/api/v1/operations/customers/${source.id}/profile`, {}, 404);
const exportResponse = await fetch(`${baseUrl}/api/v1/operations/customers/export`, { headers: { cookie } });
if (!exportResponse.ok || !exportResponse.headers.get("content-type")?.includes("text/csv")) throw new Error("Ekspor CSV admin gagal");
if (!(await exportResponse.text()).includes(`Target Utama ${suffix}`)) throw new Error("Ekspor CSV tidak memuat pelanggan target");
const profile = (await request(`/api/v1/operations/customers/${target.id}/profile`)).data;
if (!profile.customer.communicationConsent || profile.customer.preferredChannel !== "whatsapp") throw new Error("Persetujuan komunikasi pelanggan tidak tersimpan");
if (!profile.vehicles.some((item) => item.id === vehicle.id) || !profile.vehicles.some((item) => item.id === sourceVehicle.id)) throw new Error("Transfer atau merge kendaraan tidak terhubung ke pelanggan target");
if (!profile.orders.some((item) => item.id === sourceOrder.id) || !profile.reminders.some((item) => item.id === reminder.id)) throw new Error("Merge Service Order atau reminder tidak terhubung ke pelanggan target");
for (const action of ["customer.update", "vehicle.update", "vehicle.owner.transfer", "customer.merge"]) {
  if (!profile.auditHistory.some((item) => item.action === action)) throw new Error(`Audit ${action} tidak ditemukan`);
}
console.log(JSON.stringify({ verified: true, customerId: target.id, transferredVehicleId: vehicle.id, mergedVehicleId: sourceVehicle.id }));
