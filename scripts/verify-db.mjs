import crypto from "node:crypto";
import pg from "pg";
import process from "node:process";

const { Client } = pg;
const ownerPassword = process.env.POSTGRES_PASSWORD;
const runtimePassword = process.env.POSTGRES_RUNTIME_PASSWORD;
if (!ownerPassword || !runtimePassword) throw new Error("POSTGRES_PASSWORD dan POSTGRES_RUNTIME_PASSWORD wajib diisi");
const config = { host: process.env.POSTGRES_HOST || "127.0.0.1", port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB || "honda_workshop" };
const owner = new Client({ ...config, user: process.env.POSTGRES_USER || "honda_owner", password: ownerPassword });
const runtime = new Client({ ...config, user: "honda_runtime", password: runtimePassword });
await owner.connect(); await runtime.connect();
const code = `VERIFY${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
try {
  const role = await owner.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='honda_runtime'");
  if (role.rows[0]?.rolsuper || role.rows[0]?.rolbypassrls) throw new Error("Runtime role memiliki privilege berbahaya");
  const forced = await owner.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE relforcerowsecurity)::int AS forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r'");
  if (forced.rows[0].total !== forced.rows[0].forced) throw new Error("Ada tabel bisnis tanpa FORCE RLS");
  const user = (await owner.query("SELECT id FROM app.users WHERE email=$1", [(process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local").toLowerCase()])).rows[0];
  if (!user) throw new Error("Bootstrap admin tidak ditemukan");
  await owner.query("INSERT INTO app.products(part_code,name,het,created_by,updated_by) VALUES($1,'Verifier Product',1,$2,$2)", [code, user.id]);
  const anonymous = await runtime.query("SELECT count(*)::int AS total FROM app.products WHERE part_code=$1", [code]);
  if (anonymous.rows[0].total !== 0) throw new Error("Anonymous runtime dapat membaca data");
  await runtime.query("BEGIN");
  await runtime.query("SELECT set_config('app.user_id',$1,true)", [user.id]);
  await runtime.query("SELECT set_config('app.user_role','cashier',true)");
  const cashierRead = await runtime.query("SELECT count(*)::int AS total FROM app.products WHERE part_code=$1", [code]);
  if (cashierRead.rows[0].total !== 1) throw new Error("Cashier tidak dapat membaca katalog");
  let denied = false;
  try { await runtime.query("INSERT INTO app.products(part_code,name,het) VALUES($1,'Denied',1)", [`${code}X`]); } catch { denied = true; }
  await runtime.query("ROLLBACK");
  if (!denied) throw new Error("Cashier dapat menulis katalog");
  console.log(JSON.stringify({ verified: true, forcedRlsTables: forced.rows[0].forced }));
} finally {
  await owner.query("DELETE FROM app.products WHERE part_code=$1", [code]).catch(() => undefined);
  await runtime.end(); await owner.end();
}
