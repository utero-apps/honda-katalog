import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scanner = readFileSync(new URL("./CatalogTools.tsx", import.meta.url), "utf8");

describe("catalog barcode scanner", () => {
  it("optimizes camera scanning for common product barcodes", () => {
    for (const format of ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "CODE_39", "CODE_93", "ITF", "CODABAR"]) {
      expect(scanner).toContain(`formats.${format}`);
    }
    expect(scanner).toContain("useBarCodeDetectorIfSupported: true");
    expect(scanner).toContain("fps: 20");
    expect(scanner).toContain("Math.floor(width * 0.92)");
    expect(scanner).not.toContain("Html5Qrcode.getCameras()");
  });

  it("provides photo and manual fallbacks", () => {
    expect(scanner).toContain('capture="environment"');
    expect(scanner).toContain("scanFile(file, false)");
    expect(scanner).toContain("Masukkan barcode manual");
    expect(scanner).toContain("Akses kamera ditolak.");
    expect(scanner).toContain("Kamera sedang dipakai aplikasi atau tab lain.");
  });
});
