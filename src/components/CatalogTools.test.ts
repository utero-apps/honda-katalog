import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scanner = readFileSync(new URL("./CatalogTools.tsx", import.meta.url), "utf8");

describe("catalog barcode scanner", () => {
  it("optimizes camera scanning for common product barcodes", () => {
    expect(scanner).toContain("new scannerLibrary.Html5Qrcode(scannerId)");
    expect(scanner).toContain("{ facingMode: \"environment\" }");
    expect(scanner).toContain("fps: 10");
    expect(scanner).toContain("qrbox: { width: 280, height: 140 }");
    expect(scanner).not.toContain("Html5Qrcode.getCameras()");
  });

  it("provides photo and manual fallbacks", () => {
    expect(scanner).toContain('capture="environment"');
    expect(scanner).toContain("scanFile(file, false)");
    expect(scanner).toContain("Masukkan barcode manual");
    expect(scanner).toContain("Akses kamera ditolak.");
    expect(scanner).toContain("Kamera sedang dipakai aplikasi atau tab lain.");
    expect(scanner).toContain("Scanner gagal membuka kamera:");
  });
});
