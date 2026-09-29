import { describe, expect, it, vi } from "vitest";
import { getHandoverAssets } from "./handover-assets";

const serviceOrderId = "11111111-1111-4111-8111-111111111111";
const checklist = {
  vehicleChecked: true,
  belongingsReturned: true,
  keysReturned: true,
  workExplained: true,
  notes: "Siap keluar",
};
const finalPhoto = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "final_photo",
  mimeType: "image/jpeg",
  size: 128,
  sha256: "a".repeat(64),
};
const signature = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "signature",
  mimeType: "image/png",
  size: 96,
  sha256: "b".repeat(64),
};

function clientWithAssets(assets: Array<typeof finalPhoto | typeof signature>) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ id: serviceOrderId, status: "paid", handedOverAt: null }] })
    .mockResolvedValueOnce({ rows: [checklist] })
    .mockResolvedValueOnce({ rows: assets });
  return { client: { query } as never, query };
}

describe("handover readiness", () => {
  it("remains incomplete after checklist and photo until signature exists", async () => {
    const withoutSignature = clientWithAssets([finalPhoto]);

    const incomplete = await getHandoverAssets(withoutSignature.client, serviceOrderId);

    expect(incomplete.readiness).toEqual({
      checklistReady: true,
      photoCount: 1,
      hasSignature: false,
      ready: false,
    });
    expect(withoutSignature.query).toHaveBeenCalledTimes(3);

    const withSignature = clientWithAssets([finalPhoto, signature]);

    const complete = await getHandoverAssets(withSignature.client, serviceOrderId);

    expect(complete.readiness).toEqual({
      checklistReady: true,
      photoCount: 1,
      hasSignature: true,
      ready: true,
    });
    expect(withSignature.query).toHaveBeenCalledTimes(3);
  });
});
