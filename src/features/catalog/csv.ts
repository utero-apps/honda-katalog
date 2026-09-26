import { z } from "zod";

const rowSchema = z.object({
  partCode: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(500),
  het: z.coerce.number().min(0),
  hpp: z.coerce.number().min(0).default(0),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  category: z.string().trim().max(80).default(""),
  barcode: z.string().trim().max(100).default(""),
  compatibleModels: z.array(z.string()).default([]),
});

export type CatalogCsvRow = z.infer<typeof rowSchema>;

function splitLine(line: string, delimiter: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === delimiter && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += character;
  }
  values.push(value.trim());
  return values;
}

const aliases: Record<string, string> = {
  partcode: "partCode", kode: "partCode", kodepart: "partCode", partname: "name", nama: "name",
  het: "het", harga: "het", hpp: "hpp", status: "status", kategori: "category", category: "category",
  barcode: "barcode", compatibility: "compatibility", kompatibilitas: "compatibility", motor: "compatibility",
};

export function parseCatalogCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV harus memiliki header dan minimal satu data");
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitLine(lines[0], delimiter).map((header) => aliases[header.toLowerCase().replace(/[^a-z0-9]/g, "")] || header);
  const errors: { row: number; message: string }[] = [];
  const rows: CatalogCsvRow[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  lines.slice(1).forEach((line, index) => {
    const values = splitLine(line, delimiter);
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const canonicalCode = String(record.partCode || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (seen.has(canonicalCode)) { duplicateCount += 1; errors.push({ row: index + 2, message: "Kode duplikat dalam CSV" }); return; }
    seen.add(canonicalCode);
    const parsed = rowSchema.safeParse({
      ...record,
      het: String(record.het || "0").replace(/[^0-9]/g, ""),
      hpp: String(record.hpp || "0").replace(/[^0-9]/g, ""),
      status: String(record.status || "active").toLowerCase() === "active" ? "active" : String(record.status || "").toLowerCase() === "archived" ? "archived" : "inactive",
      compatibleModels: String(record.compatibility || "").split(/[|,]/).map((item) => item.trim()).filter(Boolean),
    });
    if (!parsed.success) { errors.push({ row: index + 2, message: parsed.error.issues.map((issue) => issue.message).join(", ") }); return; }
    rows.push(parsed.data);
  });
  return { rows, errors, summary: { total: lines.length - 1, valid: rows.length, invalid: errors.length, duplicates: duplicateCount } };
}
