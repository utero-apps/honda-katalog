import test from "node:test";
import assert from "node:assert/strict";
import { canonicalCode, normalizeCatalogRows, parseCatalogSource, toApiCsv } from "./catalog-migrate-lib.mjs";

test("normalizes Supabase snake_case JSON and nested relations", () => {
  const parsed = normalizeCatalogRows([{ part_code: " 06455-KVB-901 ", name: "Pad Set", sale_price: "Rp 125.000", cost_price: "80.000", category_name: "Rem", product_barcodes: [{ barcode: "899001" }], compatible_models: [{ name: "Beat 110" }], is_active: true }]);
  assert.deepEqual(parsed.summary, { total: 1, valid: 1, invalid: 0 });
  assert.equal(parsed.rows[0].canonicalCode, "06455KVB901");
  assert.equal(parsed.rows[0].het, 125000);
  assert.deepEqual(parsed.rows[0].barcodes, ["899001"]);
  assert.deepEqual(parsed.rows[0].compatibleModels, ["Beat 110"]);
});

test("parses quoted multiline CSV and detects duplicate canonical codes", () => {
  const parsed = parseCatalogSource('part_code,name,price,description\r\nABC-01,"Filter, Oil",25000,"baris satu\nbaris dua"\r\nABC01,Duplicate,1,x', ".csv");
  assert.equal(parsed.rows[0].name, "Filter, Oil");
  assert.equal(parsed.rows[0].description, "baris satu\nbaris dua");
  assert.equal(parsed.errors[0].message, "partCode duplikat dalam sumber");
});

test("accepts wrapped JSON exports and serializes safe API CSV", () => {
  const parsed = parseCatalogSource(JSON.stringify({ data: [{ kode: "AA-01", nama: "Kampas Rem", harga: 30000, barcode: "12345", motor: "Beat 110|Vario 125" }] }), ".json");
  const csv = toApiCsv(parsed.rows);
  assert.match(csv, /^partCode,name,het/);
  assert.match(csv, /AA-01,Kampas Rem,30000/);
  assert.equal(canonicalCode(" aa-01 "), "AA01");
});

test("rejects invalid rows without passing partial data", () => {
  const parsed = normalizeCatalogRows([{ part_code: "", name: "x", price: -1 }]);
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.errors.length, 1);
});

test("maps discontinued Supabase values to API archived status", () => {
  const parsed = normalizeCatalogRows([{ part_code: "ZZ-01", name: "Produk Lama", status: "discontinued" }]);
  assert.equal(parsed.rows[0].status, "archived");
});
