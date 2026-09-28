import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const scanner = readFileSync(new URL("../components/CatalogTools.tsx", import.meta.url), "utf8");

describe("product code scanner", () => {
  it("provides a scanner from the product code field", () => {
    expect(page).toContain("Scan kode");
    expect(page).toContain("setShowProductScanner(true)");
    expect(page).toContain("<BarcodeScannerDialog");
    expect(scanner).toContain("export function BarcodeScannerDialog");
  });

  it("writes a scanned value into the controlled part code field", () => {
    expect(page).toContain('const [partCodeValue, setPartCodeValue] = useState("")');
    expect(page).toContain("value={partCodeValue}");
    expect(page).toContain("setPartCodeValue(value)");
    expect(page).toContain('name="partCode"');
  });
});
