import process from "node:process";
import { spawnSync } from "node:child_process";

const input = process.argv[2];
const password = process.env.POSTGRES_PASSWORD;
if (!input) throw new Error("Gunakan: npm run db:restore -- <file.dump>");
if (!password) throw new Error("POSTGRES_PASSWORD wajib diisi");
const result = spawnSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--host", process.env.POSTGRES_HOST || "127.0.0.1", "--port", process.env.POSTGRES_PORT || "5432", "--username", process.env.POSTGRES_USER || "honda_owner", "--dbname", process.env.POSTGRES_DB || "honda_workshop", input], { stdio: "inherit", env: { ...process.env, PGPASSWORD: password } });
if (result.status !== 0) process.exit(result.status ?? 1);
