export function customerCsvCell(value: unknown) {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function customerCsv(rows: Array<Record<string, unknown>>) {
  const columns = ["id", "name", "phone", "email", "address", "isActive", "plateNumber", "model", "year", "odometer", "lastServiceAt"];
  return `\uFEFF${[columns.join(","), ...rows.map((row) => columns.map((column) => customerCsvCell(row[column])).join(","))].join("\r\n")}\r\n`;
}
