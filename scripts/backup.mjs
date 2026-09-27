import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const directory = process.env.BACKUP_DIR || "backups";
const password = process.env.POSTGRES_PASSWORD;
if (!password) throw new Error("POSTGRES_PASSWORD wajib diisi");
await mkdir(directory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = path.resolve(directory, `honda-${timestamp}.dump`);
const result = spawnSync("pg_dump", ["--format=custom", "--file", output, "--host", process.env.POSTGRES_HOST || "127.0.0.1", "--port", process.env.POSTGRES_PORT || "5432", "--username", process.env.POSTGRES_USER || "honda_owner", process.env.POSTGRES_DB || "honda_workshop"], { stdio: "inherit", env: { ...process.env, PGPASSWORD: password } });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(output);
