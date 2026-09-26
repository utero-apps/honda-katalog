import { describe, expect, it } from "vitest";
import { parseCatalogCsv } from "@/features/catalog/csv";

describe("catalog CSV", () => {
  it("parses semicolon CSV and normalizes price", () => {
    const result = parseCatalogCsv("kode;nama;het;kategori;motor\nABC-1;Kampas Rem;Rp 45.000;Rem;Beat 110|Vario 125");
    expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0, duplicates: 0 });
    expect(result.rows[0]).toMatchObject({ partCode: "ABC-1", het: 45000, category: "Rem" });
  });

  it("reports duplicate canonical codes", () => {
    const result = parseCatalogCsv("kode,nama,het\nAB-1,Produk A,1\nAB1,Produk B,2");
    expect(result.summary.duplicates).toBe(1);
  });
});
