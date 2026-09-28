import { describe, expect, it } from "vitest";
import { productImageLimits, validateProductImage } from "./product-image";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("product image upload validation", () => {
  it("accepts a PNG with matching MIME type and signature", async () => {
    const image = new File([png], "produk.png", { type: "image/png" });
    await expect(validateProductImage(image)).resolves.toMatchObject({ extension: "png" });
  });

  it("rejects an image MIME type that does not match its content", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "produk.png", { type: "image/png" });
    await expect(validateProductImage(image)).rejects.toMatchObject({ code: "IMAGE_CONTENT_INVALID" });
  });

  it("limits product images to five megabytes", async () => {
    const image = new File([new Uint8Array(productImageLimits.maxImageBytes + 1)], "produk.jpg", { type: "image/jpeg" });
    await expect(validateProductImage(image)).rejects.toMatchObject({ code: "IMAGE_SIZE_INVALID" });
  });
});
