import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const scanner = readFileSync(new URL("../components/CatalogTools.tsx", import.meta.url), "utf8");
const imageStorage = readFileSync(new URL("../features/catalog/product-image.ts", import.meta.url), "utf8");

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

  it("provides secure drag-and-drop product image upload", () => {
    expect(page).toContain('id="product-image"');
    expect(page).toContain('onDrop={(event) =>');
    expect(page).toContain('uploadProductImage(event.dataTransfer.files?.[0])');
    expect(page).toContain('"/api/v1/catalog/product-images"');
    expect(imageStorage).toContain("/api/v1/media/products/${filename}");
    expect(page).toContain('accept="image/jpeg,image/png,image/webp,image/avif"');
    expect(page).toContain("Ukuran gambar maksimal 5 MB.");
  });
});
