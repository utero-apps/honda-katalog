import { describe, expect, it, vi } from "vitest";
import { ApiError, fail } from "@/server/http";

describe("API error envelope", () => {
  it("returns known safe errors", async () => {
    const response = fail(new ApiError(403, "FORBIDDEN", "Ditolak"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN", message: "Ditolak" } });
  });
  it("hides unhandled error details", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = fail(new Error("database password leaked"));
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("database password leaked");
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
