import process from "node:process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:37800";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");

let cookie = "";

async function fetchJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function requireOk(path, init) {
  const result = await fetchJson(path, init);
  if (!result.response.ok) {
    throw new Error(`${init?.method || "GET"} ${path}: ${result.response.status} ${result.body?.error?.message || result.body || ""}`);
  }
  return result.body?.data;
}

const anonymous = await fetchJson("/api/v1/operations/inventory/balances");
if (anonymous.response.status !== 401) {
  throw new Error(`Inventory anonymous access tidak ditolak: ${anonymous.response.status}`);
}

const login = await fetchJson("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
if (!login.response.ok) throw new Error(`Login gagal: ${login.response.status}`);
cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
if (!cookie) throw new Error("Session cookie tidak diterbitkan");

const balances = await requireOk("/api/v1/operations/inventory/balances");
if (!Array.isArray(balances)) throw new Error("Kontrak inventory balances bukan array");

const finance = await requireOk("/api/v1/intelligence/finance-overview");
if (!finance || typeof finance.summary?.totalCogs !== "number") {
  throw new Error("Kontrak finance overview tidak memuat totalCogs");
}

const overview = await requireOk("/api/v1/intelligence/inventory-overview");
if (!overview?.summary || !Array.isArray(overview.stockOverview) || !Array.isArray(overview.lowStock)) {
  throw new Error("Kontrak inventory overview tidak lengkap");
}

const reads = {};
for (const path of ["/api/v1/operations/inventory/movements", "/api/v1/business/purchase-orders", "/api/v1/business/receipts", "/api/v1/operations/inventory/opnames"]) {
  const data = await requireOk(path);
  if (!Array.isArray(data)) throw new Error(`Kontrak read ${path} bukan array`);
  reads[path] = data.length;
}

console.log(JSON.stringify({
  verified: true,
  balances: balances.length,
  totalCogs: finance.summary.totalCogs,
  inventoryItems: overview.summary.totalItems,
  reads,
}));
