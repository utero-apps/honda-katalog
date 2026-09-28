import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  assertHandoverAssetsReady,
  handoverAssetKindSchema,
  handoverAssetLimits,
  handoverChecklistSchema,
  prepareHandoverAsset,
  saveHandoverAsset,
} from "@/features/service-orders/handover-assets";

const serviceOrderId = "11111111-1111-4111-8111-111111111111";
const actor = { id: "22222222-2222-4222-8222-222222222222", requestId: "test-request" };
const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(size = 32, type = "image/png") {
  const bytes = new Uint8Array(size);
  bytes.set(pngHeader);
  return new File([bytes], "proof.png", { type });
}

describe("service order handover upload validation", () => {
  it("accepts PNG photo and signature, returning verified binary and checksum", async () => {
    const photo = await prepareHandoverAsset(pngFile(), "final_photo");
    const signature = await prepareHandoverAsset(pngFile(), "signature");

    expect(photo.mimeType).toBe("image/png");
    expect(signature.content).toBeInstanceOf(Buffer);
    expect(photo.sha256).toBe(createHash("sha256").update(photo.content).digest("hex"));
  });

  it("rejects unknown upload kind and incomplete checklist", () => {
    expect(handoverAssetKindSchema.safeParse("invoice").success).toBe(false);
    expect(handoverChecklistSchema.safeParse({ vehicleChecked: true }).success).toBe(false);
    expect(handoverChecklistSchema.safeParse({ vehicleChecked: true, belongingsReturned: true, keysReturned: true, workExplained: true }).success).toBe(true);
  });

  it("rejects unsupported MIME and non-PNG signature", async () => {
    await expect(prepareHandoverAsset(pngFile(32, "application/pdf"), "final_photo"))
      .rejects.toMatchObject({ status: 422, code: "HANDOVER_ASSET_TYPE_INVALID" });
    await expect(prepareHandoverAsset(pngFile(32, "image/jpeg"), "signature"))
      .rejects.toMatchObject({ status: 422, code: "SIGNATURE_TYPE_INVALID" });
  });

  it("rejects spoofed PNG bytes and undersized files", async () => {
    await expect(prepareHandoverAsset(new File([new Uint8Array(32)], "spoof.png", { type: "image/png" }), "signature"))
      .rejects.toMatchObject({ status: 422, code: "HANDOVER_ASSET_CONTENT_INVALID" });
    await expect(prepareHandoverAsset(new File([new Uint8Array(31)], "small.png", { type: "image/png" }), "final_photo"))
      .rejects.toMatchObject({ status: 422, code: "HANDOVER_ASSET_SIZE_INVALID" });
  });

  it("enforces exact file-size boundaries without loading oversized bytes", async () => {
    await expect(prepareHandoverAsset(pngFile(handoverAssetLimits.signatureBytes), "signature")).resolves.toMatchObject({ mimeType: "image/png" });
    await expect(prepareHandoverAsset(pngFile(handoverAssetLimits.signatureBytes + 1), "signature"))
      .rejects.toMatchObject({ code: "HANDOVER_ASSET_SIZE_INVALID" });
    await expect(prepareHandoverAsset(pngFile(handoverAssetLimits.finalPhotoBytes + 1), "final_photo"))
      .rejects.toMatchObject({ code: "HANDOVER_ASSET_SIZE_INVALID" });
  });

  it("blocks a seventh photo before INSERT", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: serviceOrderId, status: "paid", handedOverAt: null }] })
      .mockResolvedValueOnce({ rows: [{ count: "6" }] });

    await expect(saveHandoverAsset(
      { query } as never,
      actor,
      serviceOrderId,
      "final_photo",
      await prepareHandoverAsset(pngFile(), "final_photo"),
    )).rejects.toMatchObject({ status: 409, code: "FINAL_PHOTO_LIMIT" });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("denies handover when checklist, final photo, or signature is missing", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: serviceOrderId, status: "paid", handedOverAt: null }] })
      .mockResolvedValueOnce({ rows: [{ checklistReady: false, photoCount: 0, signatureId: null }] });

    await expect(assertHandoverAssetsReady({ query } as never, serviceOrderId))
      .rejects.toMatchObject({
        status: 409,
        code: "HANDOVER_ASSETS_INCOMPLETE",
        fields: { checklist: expect.any(Array), finalPhotos: expect.any(Array), signature: expect.any(Array) },
      });
  });
});
