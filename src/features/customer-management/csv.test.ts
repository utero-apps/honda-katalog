import { describe, expect, it } from "vitest";
import { customerCsv, customerCsvCell } from "./csv";

describe("customer CSV", () => {
  it("escapes commas, quotes, and spreadsheet formulas", () => {
    expect(customerCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(customerCsvCell("Andi, Budi\nBaru")).toBe('"Andi, Budi Baru"');
  });

  it("adds UTF-8 BOM and stable export headers", () => {
    const csv = customerCsv([{ id: "1", name: "Pelanggan" }]);
    expect(csv.startsWith("\uFEFFid,name,phone,email,address,isActive,plateNumber,model,year,odometer,lastServiceAt\r\n")).toBe(true);
  });
});
