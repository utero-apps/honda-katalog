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
  await client.query("INSERT INTO app.users(email,display_name,password_hash,role) SELECT $1,'Security Cashier',password_hash,'cashier' FROM app.users WHERE email=$2", [cashierEmail, ownerEmail]);

  const ownerCookieA = await login(ownerEmail);
  const ownerCookieB = await login(ownerEmail);
  if (ownerCookieA === ownerCookieB) throw new Error("Token session tidak unik");

  const cashierCookie = await login(cashierEmail);
  const escalation = await fetch(`${baseUrl}/api/v1/catalog/products`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie: cashierCookie }, body: JSON.stringify({ partCode: `SEC-${suffix}`, name: "Escalation Attempt", het: 1 }) });
  if (escalation.status !== 403) throw new Error(`Privilege escalation tidak ditolak: ${escalation.status}`);

  const auditAccess = await fetch(`${baseUrl}/api/v1/audit`, { headers: { cookie: cashierCookie } });
  if (auditAccess.status !== 403) throw new Error(`Audit role boundary gagal: ${auditAccess.status}`);

  const unknownId = crypto.randomUUID();
  const idor = await fetch(`${baseUrl}/api/v1/operations/service-orders/${unknownId}/details`, { headers: { cookie: cashierCookie } });
  if (idor.status !== 404) throw new Error(`Unknown resource tidak aman: ${idor.status}`);
  const idorBody = await idor.json();
  if (idorBody.error?.code !== "SERVICE_ORDER_NOT_FOUND") throw new Error("Unknown resource membocorkan detail internal");

  const token = ownerCookieA.split("=")[1];
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await client.query("UPDATE app.sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_hash=$1", [tokenHash]);
  const expired = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: ownerCookieA } });
  if (expired.status !== 401) throw new Error("Session expiry gagal");

  console.log(JSON.stringify({ verified: true, anonymous: true, escalation: true, idor: true, expiry: true, rotation: true }));
} finally {
  await client.query("DELETE FROM app.users WHERE email LIKE 'security-%@honda.local'");
  await client.end();
}
