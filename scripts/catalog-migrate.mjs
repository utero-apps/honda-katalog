import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import pg from "pg";
import { parseCatalogSource, toApiCsv } from "./catalog-migrate-lib.mjs";

function usage() {
  return "Usage: npm run catalog:migrate -- --input <export.json|export.csv> [--target api|db] [--apply] [--report report.json]";
}

function parseArgs(argv) {
  const result = { target: "api", apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") result.apply = true;
    else if (["--input", "--target", "--report"].includes(argument)) result[argument.slice(2)] = argv[++index];
    else if (argument === "--help") result.help = true;
    else throw new Error(`Argumen tidak dikenal: ${argument}`);
  }
  if (!result.help && !result.input) throw new Error("--input wajib diisi");
  if (!result.help && !["api", "db"].includes(result.target)) throw new Error("--target harus api atau db");
  return result;
}

async function apiRequest(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${pathname} gagal (${response.status}): ${body?.error?.message ?? "respons tidak valid"}`);
  return { response, body };
}

async function runApi(rows, apply) {
  const baseUrl = (process.env.CATALOG_MIGRATION_API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const email = process.env.CATALOG_MIGRATION_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.CATALOG_MIGRATION_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("CATALOG_MIGRATION_EMAIL dan CATALOG_MIGRATION_PASSWORD wajib diisi untuk target API");
  const login = await apiRequest(baseUrl, "/api/v1/auth/login", {
    method: "POST", headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ email, password }),
  });
  const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) throw new Error("API tidak menerbitkan session cookie");
  const csv = toApiCsv(rows);
  const result = await apiRequest(baseUrl, "/api/v1/catalog/import", {
    method: "POST", headers: { "content-type": "application/json", origin: baseUrl, cookie }, body: JSON.stringify({ csv, mode: apply ? "import" : "preview" }),
  });
  return apply ? result.body.data : { preview: result.body.data.summary, wouldImport: rows.length };
}

async function replaceRelations(client, productId, row, modelMap) {
  await client.query("DELETE FROM app.product_barcodes WHERE product_id=$1", [productId]);
  await client.query("DELETE FROM app.product_vehicle_compatibility WHERE product_id=$1", [productId]);
  for (const [index, barcode] of row.barcodes.entries()) {
    await client.query("INSERT INTO app.product_barcodes(product_id,barcode,is_primary) VALUES($1,$2,$3)", [productId, barcode, index === 0]);
  }
  for (const name of row.compatibleModels) {
    const modelId = modelMap.get(name.toLowerCase());
    if (modelId) await client.query("INSERT INTO app.product_vehicle_compatibility(product_id,vehicle_model_id) VALUES($1,$2)", [productId, modelId]);
  }
}

async function runDb(rows, apply) {
  const connectionString = process.env.CATALOG_MIGRATION_DATABASE_URL || process.env.MIGRATION_DATABASE_URL;
  if (!connectionString && !process.env.POSTGRES_PASSWORD) throw new Error("CATALOG_MIGRATION_DATABASE_URL atau POSTGRES_PASSWORD wajib diisi untuk target DB");
  const client = new pg.Client(connectionString ? { connectionString } : {
    host: process.env.POSTGRES_HOST || "127.0.0.1", port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB || "honda_workshop",
    user: process.env.POSTGRES_USER || "honda_owner", password: process.env.POSTGRES_PASSWORD,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const actorEmail = (process.env.CATALOG_MIGRATION_ACTOR_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local").toLowerCase();
    const actor = (await client.query("SELECT id,role FROM app.users WHERE email=$1 AND is_active=true", [actorEmail])).rows[0];
    if (!actor) throw new Error(`Actor migrasi tidak ditemukan: ${actorEmail}`);
    await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.user_role',$2,true),set_config('app.request_id',$3,true)", [actor.id, actor.role, crypto.randomUUID()]);
    const categoryRows = (await client.query("SELECT id,name FROM app.product_categories WHERE is_active=true")).rows;
    const modelRows = (await client.query("SELECT id,name FROM app.vehicle_models WHERE is_active=true")).rows;
    const categoryMap = new Map(categoryRows.map((item) => [item.name.toLowerCase(), item.id]));
    const modelMap = new Map(modelRows.map((item) => [item.name.toLowerCase(), item.id]));
    const result = { created: 0, updated: 0, unchanged: 0, unknownCategories: new Set(), unknownModels: new Set() };
    for (const row of rows) {
      const existing = (await client.query("SELECT id,part_code,name,category_id,het::float8,hpp::float8,unit,minimum_stock::float8,status::text,description FROM app.products WHERE canonical_code=$1", [row.canonicalCode])).rows[0];
      if (row.category && !categoryMap.has(row.category.toLowerCase())) result.unknownCategories.add(row.category);
      row.compatibleModels.filter((name) => !modelMap.has(name.toLowerCase())).forEach((name) => result.unknownModels.add(name));
      const categoryId = categoryMap.get(row.category.toLowerCase()) ?? null;
      if (existing) {
        await client.query("UPDATE app.products SET part_code=$1,name=$2,category_id=$3,het=$4,hpp=$5,unit=$6,minimum_stock=$7,status=$8,description=$9,updated_by=$10,updated_at=now() WHERE id=$11", [row.partCode,row.name,categoryId,row.het,row.hpp,row.unit,row.minimumStock,row.status,row.description,actor.id,existing.id]);
        await replaceRelations(client, existing.id, row, modelMap);
        result.updated += 1;
      } else {
        const productId = (await client.query("INSERT INTO app.products(part_code,name,category_id,het,hpp,unit,minimum_stock,status,description,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id", [row.partCode,row.name,categoryId,row.het,row.hpp,row.unit,row.minimumStock,row.status,row.description,actor.id])).rows[0].id;
        await replaceRelations(client, productId, row, modelMap);
        await client.query("INSERT INTO app.product_prices(product_id,price_type,amount,created_by) VALUES($1,'het',$2,$4),($1,'hpp',$3,$4)", [productId,row.het,row.hpp,actor.id]);
        result.created += 1;
      }
    }
    if (apply) await client.query("COMMIT"); else await client.query("ROLLBACK");
    return { created: result.created, updated: result.updated, unknownCategories: [...result.unknownCategories].sort(), unknownModels: [...result.unknownModels].sort() };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { await client.end(); }
}

let options;
try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); console.error(usage()); process.exitCode = 1; }
if (options?.help) console.log(usage());
else if (options) {
  const startedAt = new Date().toISOString();
  try {
    const inputPath = path.resolve(options.input);
    const parsed = parseCatalogSource(await fs.readFile(inputPath, "utf8"), path.extname(inputPath));
    if (parsed.errors.length) {
      const report = { ok: false, dryRun: !options.apply, target: options.target, source: path.basename(inputPath), startedAt, finishedAt: new Date().toISOString(), sourceSummary: parsed.summary, errors: parsed.errors };
      if (options.report) await fs.writeFile(path.resolve(options.report), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
    } else {
    const targetResult = options.target === "api" ? await runApi(parsed.rows, options.apply) : await runDb(parsed.rows, options.apply);
    const report = { ok: true, dryRun: !options.apply, target: options.target, source: path.basename(inputPath), startedAt, finishedAt: new Date().toISOString(), sourceSummary: parsed.summary, result: targetResult, errors: [] };
    if (options.report) await fs.writeFile(path.resolve(options.report), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify(report, null, 2));
    }
  } catch (error) {
    const report = { ok: false, dryRun: !options.apply, target: options.target, startedAt, finishedAt: new Date().toISOString(), errors: [{ message: error instanceof Error ? error.message : String(error) }] };
    if (options.report) await fs.writeFile(path.resolve(options.report), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" }).catch(() => {});
    console.error(JSON.stringify(report, null, 2)); process.exitCode = 1;
  }
}
