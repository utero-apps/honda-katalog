import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL;
const runtimePassword = process.env.POSTGRES_RUNTIME_PASSWORD;

if (!connectionString && !process.env.POSTGRES_PASSWORD) throw new Error("MIGRATION_DATABASE_URL atau POSTGRES_PASSWORD wajib diisi");
if (!runtimePassword || runtimePassword.length < 16) {
  throw new Error("POSTGRES_RUNTIME_PASSWORD minimal 16 karakter");
}

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const client = new Client(connectionString ? { connectionString } : {
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "honda_workshop",
  user: process.env.POSTGRES_USER || "honda_owner",
  password: process.env.POSTGRES_PASSWORD,
});
await client.connect();

try {
  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'honda_runtime'");
  if (role.rowCount === 0) {
    await client.query(`CREATE ROLE honda_runtime LOGIN PASSWORD ${sqlLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  } else {
    await client.query(`ALTER ROLE honda_runtime PASSWORD ${sqlLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const directory = path.resolve("db/migrations");
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("SELECT checksum FROM public.schema_migrations WHERE version = $1", [file]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Migration ${file} berubah setelah diterapkan`);
      console.log(`skip ${file}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      if (file === "006_pos.sql") {
        await client.query(`INSERT INTO app.roles(code,name) VALUES
          ('owner','Owner'),('admin','Admin'),('cashier','Cashier'),
          ('mechanic','Mechanic'),('warehouse','Warehouse'),('finance','Finance')
          ON CONFLICT (code) DO NOTHING`);
      }
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations(version, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
