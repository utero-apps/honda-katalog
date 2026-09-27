const FIELD_ALIASES = {
  partCode: ["partCode", "part_code", "kode", "kode_part", "sku", "code"],
  name: ["name", "nama", "part_name", "product_name"],
  category: ["category", "kategori", "category_name"],
  het: ["het", "harga", "price", "sale_price", "selling_price"],
  hpp: ["hpp", "cost", "cost_price", "purchase_price"],
  unit: ["unit", "satuan"],
  minimumStock: ["minimumStock", "minimum_stock", "min_stock", "stok_minimum"],
  status: ["status", "is_active", "active"],
  description: ["description", "deskripsi", "notes", "catatan"],
  barcodes: ["barcodes", "barcode", "product_barcodes"],
  compatibleModels: ["compatibleModels", "compatible_models", "compatibility", "kompatibilitas", "motor"],
};

function firstValue(record, aliases) {
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null) return record[alias];
  }
  return undefined;
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return value;
  const normalized = String(value).trim().replace(/\s/g, "").replace(/^Rp/i, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(normalized);
}

function parseList(value, nestedKey) {
  if (value === undefined || value === null || value === "") return [];
  const values = Array.isArray(value) ? value : String(value).split(/[|,;]/);
  return [...new Set(values.map((item) => {
    if (typeof item === "object" && item !== null) return item[nestedKey] ?? item.name ?? item.barcode ?? "";
    return item;
  }).map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeStatus(value) {
  if (value === false || String(value).toLowerCase() === "false" || String(value).toLowerCase() === "inactive") return "inactive";
  if (["archived", "discontinued"].includes(String(value).toLowerCase())) return "archived";
  return "active";
}

export function canonicalCode(value) {
  return String(value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function normalizeCatalogRows(records) {
  if (!Array.isArray(records)) throw new Error("Data katalog harus berupa array");
  const rows = [];
  const errors = [];
  const seen = new Set();

  records.forEach((record, index) => {
    const sourceRow = index + 1;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push({ row: sourceRow, message: "Baris bukan object" });
      return;
    }
    const partCode = String(firstValue(record, FIELD_ALIASES.partCode) ?? "").trim();
    const name = String(firstValue(record, FIELD_ALIASES.name) ?? "").trim();
    const code = canonicalCode(partCode);
    const het = parseNumber(firstValue(record, FIELD_ALIASES.het));
    const hpp = parseNumber(firstValue(record, FIELD_ALIASES.hpp));
    const minimumStock = parseNumber(firstValue(record, FIELD_ALIASES.minimumStock));
    const messages = [];
    if (partCode.length < 2 || partCode.length > 100 || !code) messages.push("partCode tidak valid");
    if (name.length < 2 || name.length > 500) messages.push("name tidak valid");
    if (![het, hpp, minimumStock].every(Number.isFinite) || [het, hpp, minimumStock].some((number) => number < 0)) messages.push("harga/stok tidak valid");
    if (seen.has(code)) messages.push("partCode duplikat dalam sumber");
    if (messages.length) {
      errors.push({ row: sourceRow, partCode: partCode || null, message: messages.join(", ") });
      return;
    }
    seen.add(code);
    rows.push({
      sourceRow,
      partCode,
      canonicalCode: code,
      name,
      category: String(firstValue(record, FIELD_ALIASES.category) ?? "").trim(),
      het,
      hpp,
      unit: String(firstValue(record, FIELD_ALIASES.unit) ?? "pcs").trim() || "pcs",
      minimumStock,
      status: normalizeStatus(firstValue(record, FIELD_ALIASES.status)),
      description: String(firstValue(record, FIELD_ALIASES.description) ?? "").trim() || null,
      barcodes: parseList(firstValue(record, FIELD_ALIASES.barcodes), "barcode"),
      compatibleModels: parseList(firstValue(record, FIELD_ALIASES.compatibleModels), "name"),
    });
  });

  return { rows, errors, summary: { total: records.length, valid: rows.length, invalid: errors.length } };
}

function parseCsvMatrix(input) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const delimiter = input.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === delimiter && !quoted) { row.push(value); value = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    value += character;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error("CSV memiliki kutip yang tidak tertutup");
  return rows;
}

export function parseCatalogSource(content, extension = "") {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (!trimmed) throw new Error("File sumber kosong");
  if (extension.toLowerCase() === ".json" || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const records = Array.isArray(parsed) ? parsed : parsed.products ?? parsed.data ?? parsed.rows;
    if (!Array.isArray(records)) throw new Error("JSON harus berupa array atau memiliki products/data/rows array");
    return normalizeCatalogRows(records);
  }
  const matrix = parseCsvMatrix(trimmed);
  if (matrix.length < 2) throw new Error("CSV harus memiliki header dan data");
  const headers = matrix[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  return normalizeCatalogRows(matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toApiCsv(rows) {
  const headers = ["partCode", "name", "het", "hpp", "status", "category", "barcode", "compatibility"];
  return [headers.join(","), ...rows.map((row) => [row.partCode, row.name, row.het, row.hpp, row.status, row.category, row.barcodes[0] ?? "", row.compatibleModels.join("|")].map(csvCell).join(","))].join("\r\n");
}
