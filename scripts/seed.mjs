import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL;
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local").toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const displayName = process.env.BOOTSTRAP_ADMIN_NAME || "System Administrator";
const role = process.env.BOOTSTRAP_ADMIN_ROLE || "admin";
if (!connectionString && !process.env.POSTGRES_PASSWORD) throw new Error("MIGRATION_DATABASE_URL atau POSTGRES_PASSWORD wajib diisi");
if (!password || password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD minimal 12 karakter");
if (!["owner", "admin"].includes(role)) throw new Error("BOOTSTRAP_ADMIN_ROLE harus owner atau admin");

const scrypt = (value, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key));
});
const salt = crypto.randomBytes(16);
const key = await scrypt(password, salt);
const passwordHash = `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;

const roles = ["owner", "admin", "cashier", "mechanic", "warehouse", "finance"];
const permissions = [
  "users.manage", "audit.read", "catalog.read", "catalog.write", "service.read", "service.create",
  "service.assign", "service.complete", "inventory.read", "inventory.receive", "inventory.adjust",
  "purchasing.read", "purchasing.write", "purchasing.approve", "finance.read", "finance.post",
  "finance.pay", "crm.read", "crm.write", "reports.read"
];
const categories = ["Mesin", "Kelistrikan", "Rem", "Suspensi", "Transmisi", "Bodi", "Filter"];
const models = ["Beat 110", "Beat 125", "Beat 150", "Vario 125", "Vario 150", "PCX 150", "Scoopy", "Genio", "Revo", "Blade"];

const client = new Client(connectionString ? { connectionString } : {
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "honda_workshop",
  user: process.env.POSTGRES_USER || "honda_owner",
  password: process.env.POSTGRES_PASSWORD,
});
await client.connect();
try {
  await client.query("BEGIN");
  for (const role of roles) await client.query("INSERT INTO app.roles(code,name) VALUES ($1,$2) ON CONFLICT DO NOTHING", [role, role[0].toUpperCase() + role.slice(1)]);
  for (const permission of permissions) await client.query("INSERT INTO app.permissions(code,description) VALUES ($1,$2) ON CONFLICT DO NOTHING", [permission, permission]);
  for (const permission of permissions) await client.query("INSERT INTO app.role_permissions(role,permission_code) VALUES ('owner',$1),('admin',$1) ON CONFLICT DO NOTHING", [permission]);
  for (const permission of ["catalog.read","service.read","service.create","finance.read","finance.post","finance.pay","reports.read"]) await client.query("INSERT INTO app.role_permissions(role,permission_code) VALUES ('cashier',$1) ON CONFLICT DO NOTHING", [permission]);
  for (const permission of ["catalog.read","service.read","service.complete"]) await client.query("INSERT INTO app.role_permissions(role,permission_code) VALUES ('mechanic',$1) ON CONFLICT DO NOTHING", [permission]);
  for (const permission of ["catalog.read","catalog.write","inventory.read","inventory.receive","inventory.adjust","purchasing.read","purchasing.write"]) await client.query("INSERT INTO app.role_permissions(role,permission_code) VALUES ('warehouse',$1) ON CONFLICT DO NOTHING", [permission]);
  for (const permission of ["finance.read","finance.post","finance.pay","purchasing.read","reports.read"]) await client.query("INSERT INTO app.role_permissions(role,permission_code) VALUES ('finance',$1) ON CONFLICT DO NOTHING", [permission]);
  await client.query(`INSERT INTO app.users(email,display_name,password_hash,role) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,is_active=true`, [email, displayName, passwordHash, role]);
  await client.query("UPDATE app.sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM app.users WHERE email=$1) AND revoked_at IS NULL", [email]);
  for (const name of categories) await client.query("INSERT INTO app.product_categories(name,slug) VALUES ($1,$2) ON CONFLICT DO NOTHING", [name, name.toLowerCase().replaceAll(" ", "-")]);
  for (const name of models) await client.query("INSERT INTO app.vehicle_models(name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
  await client.query("INSERT INTO app.warehouses(code,name) VALUES ('MAIN','Gudang Utama') ON CONFLICT DO NOTHING");
  await client.query("COMMIT");
  console.log(`seeded ${role} ${email}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
